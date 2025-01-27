import { Color } from "../misc/color";
import { Rectangle } from "../misc/rectangle";
import { Throttle } from "../misc/throttle";
import { downloadSvgOutput } from "../misc/web";
import { Zoom } from "../misc/zoom";
import { IVboBuffer, IVboPart, PlotterWebGLBasic } from "../plotter/plotter-webgl-basic";
import { EPrimitiveType } from "../primitives/primitive-type-enum";
import { IEngineMetrics, updateEngineMetricsIndicators } from "./engine-metrics";
import { computeLastLayerAlpha, ISimulation } from "./simulation";
import * as MessagesFromWorker from "./worker/messages/from-worker/messages";
import * as MessagesToWorker from "./worker/messages/to-worker/messages";

import "../page-interface-generated";


type PendingResetCommand = {
    viewport: Rectangle;
    primitiveType: EPrimitiveType;
};

type PendingRecomputeColorsCommand = {
    colorVariation: number;
};

type PendingPerformUpdateCommand = {
    viewport: Rectangle;
    wantedDepth: number;
    subdivisionBalance: number;
    colorVariation: number;
};

class SimulationMultithreaded implements ISimulation<PlotterWebGLBasic> {
    public static readonly isSupported: boolean = (typeof Worker !== "undefined");

    private readonly worker: Worker;

    private polygonsVboBuffer: IVboBuffer;
    private linesVboBuffer: IVboBuffer;
    private hasSomethingNewToDraw: boolean = true;

    private cumulatedZoom: Zoom = Zoom.noZoom();

    private lastCommandSendingTimestamp: number = 0;
    /**  处理多线程之间的状态机 确保两个线程task来回一致 */
    private isAwaitingCommandResult: boolean = false;

    private pendingResetCommand: PendingResetCommand | null = null;
    private pendingRecomputeColorsCommand: PendingRecomputeColorsCommand | null = null;
    /** 结合 节流  100ms才执行一次 该指令 */
    private pendingPerformUpdateCommand: PendingPerformUpdateCommand | null = null;
    /** 执行节流 */
    private readonly performUpdateCommandThrottle: Throttle = new Throttle(100);

    private lastLayerBirthTimestamp: number = 0;
    private layersCount: number = 0;

    public constructor() {
        /**
         * scriptURL 指Worker线程要执行的脚本路径。
         * 使用?v=${Page.version}添加版本号这是一种常见的技巧,用于在每个新版本更新后让浏览器重新加载Worker脚本,如果版本更新，浏览器会认为这是一个新的脚本,会重新加载它
         */
        this.worker = new Worker(`script/worker.js?v=${Page.version}`);

        // 统计  work logic   work 线程执行这些逻辑
        MessagesFromWorker.NewMetrics.addListener(this.worker, (engineMetrics: IEngineMetrics) => {
            //更新UI指标属性 
            updateEngineMetricsIndicators(engineMetrics);
        });

        // 导出svg
        MessagesFromWorker.DownloadAsSvgOutput.addListener(this.worker, (output: string) => {
            downloadSvgOutput(output);
        });

        // 
        MessagesFromWorker.ResetOutput.addListener(this.worker, (polygonsVboBuffer: IVboBuffer, linesVboBuffer: IVboBuffer) => {
            this.cumulatedZoom = Zoom.noZoom();
            this.polygonsVboBuffer = polygonsVboBuffer;
            this.linesVboBuffer = linesVboBuffer;
            this.lastLayerBirthTimestamp = performance.now();
            this.layersCount = linesVboBuffer.bufferParts.length;
            this.hasSomethingNewToDraw = true;

            this.logCommandOutput("Reset");
            this.isAwaitingCommandResult = false;
        });

        MessagesFromWorker.RecomputeColorsOutput.addListener(this.worker, (polygonsVboBuffer: IVboBuffer, linesVboBuffer: IVboBuffer) => {
            this.polygonsVboBuffer = polygonsVboBuffer;
            this.linesVboBuffer = linesVboBuffer;
            this.hasSomethingNewToDraw = true;

            this.logCommandOutput("Recompute colors");
            this.isAwaitingCommandResult = false;
        });

        MessagesFromWorker.PerformUpdateOutput.addListener(this.worker, (polygonsVboBuffer: IVboBuffer, linesVboBuffer: IVboBuffer, appliedZoom: Zoom, newlayerAppeared: boolean) => {
            const invAppliedZoom = appliedZoom.inverse();
            this.cumulatedZoom = Zoom.multiply(this.cumulatedZoom, invAppliedZoom); // keep the advance we had on the worker
            this.polygonsVboBuffer = polygonsVboBuffer;
            this.linesVboBuffer = linesVboBuffer;
            if (newlayerAppeared) {
                this.lastLayerBirthTimestamp = performance.now();
            }
            this.layersCount = linesVboBuffer.bufferParts.length;
            this.hasSomethingNewToDraw = true;

            this.logCommandOutput("Perform update");
            this.isAwaitingCommandResult = false;
        });

        MessagesFromWorker.PerformUpdateNoOutput.addListener(this.worker, (appliedZoom: Zoom) => {
            const invAppliedZoom = appliedZoom.inverse();
            this.cumulatedZoom = Zoom.multiply(this.cumulatedZoom, invAppliedZoom); // keep the advance we had on the worker
            this.hasSomethingNewToDraw = true;

            this.logCommandOutput("Perform update (no output)");
            this.isAwaitingCommandResult = false;
        });
    }

    public update(viewport: Rectangle, instantZoom: Zoom, wantedDepth: number, subdivisionBalance: number, colorVariation: number): boolean {
        this.cumulatedZoom = Zoom.multiply(instantZoom, this.cumulatedZoom);

        this.pendingPerformUpdateCommand = {
            viewport,
            wantedDepth,
            subdivisionBalance,
            colorVariation,
        };
        this.sendNextCommand();

        return this.hasSomethingNewToDraw;
    }

    public draw(plotter: PlotterWebGLBasic, scaling: number, backgroundColor: Color, linesColor?: Color): void {
        this.hasSomethingNewToDraw = false;

        plotter.initialize(backgroundColor, this.cumulatedZoom, scaling);

        const emergingLayerAlpha = computeLastLayerAlpha(this.layersCount, this.lastLayerBirthTimestamp);

        if (this.polygonsVboBuffer) {
            let needToReupload = false;
            const registerPolygonBufferPart = (bufferPart: IVboPart, index: number, array: IVboPart[]) => {
                const isLastLayer = (index === array.length - 1);
                if (emergingLayerAlpha >= 1 && !isLastLayer) {
                    // if the last layer is opaque, no need to draw the previous ones
                    return;
                }

                const alpha = isLastLayer ? emergingLayerAlpha : 1;
                if (!plotter.registerPolygonsVboPartForDrawing(bufferPart.geometryId, alpha)) {
                    needToReupload = true;
                }
            };

            this.polygonsVboBuffer.bufferParts.forEach(registerPolygonBufferPart);
            if (needToReupload) {
                plotter.uploadPolygonsVbo(this.polygonsVboBuffer);
                this.polygonsVboBuffer.bufferParts.forEach(registerPolygonBufferPart);
            }
        }

        if (this.linesVboBuffer && linesColor) {
            let needToReupload = false;
            const registerLinesBufferPart = (bufferPart: IVboPart, index: number, array: IVboPart[]) => {
                const isLastLayer = (index === array.length - 1);
                const alpha = isLastLayer ? emergingLayerAlpha : 1;
                if (!plotter.registerLinesVboPartForDrawing(bufferPart.geometryId, linesColor, alpha)) {
                    needToReupload = true;
                }
            };

            this.linesVboBuffer.bufferParts.forEach(registerLinesBufferPart);
            if (needToReupload) {
                plotter.uploadLinesVbo(this.linesVboBuffer);
                this.linesVboBuffer.bufferParts.forEach(registerLinesBufferPart);
            }
        }

        plotter.finalize();
    }

    public reset(viewport: Rectangle, primitiveType: EPrimitiveType): void {
        this.pendingResetCommand = {
            viewport,
            primitiveType
        };
        this.sendNextCommand();
    }

    public recomputeColors(colorVariation: number): void {
        this.pendingRecomputeColorsCommand = {
            colorVariation,
        };

        this.sendNextCommand();
    }

    public downloadAsSvg(width: number, height: number, scaling: number, backgroundColor: Color, linesColor?: Color): void {
        MessagesToWorker.DownloadAsSvg.sendMessage(this.worker, width, height, scaling, backgroundColor, linesColor);
    }

    /**
     * 让worker线程执行耗时的逻辑，且确保发送指令->完成指令->接到反馈，避免相同指令多次分发
     */
    private sendNextCommand(): void {
        if (!this.isAwaitingCommandResult) {
            if (this.pendingResetCommand) {
                const command = this.pendingResetCommand;
                this.pendingRecomputeColorsCommand = null;
                this.pendingPerformUpdateCommand = null;
                this.pendingResetCommand = null;

                // console.log("Sending reset command");
                this.lastCommandSendingTimestamp = performance.now();
                this.isAwaitingCommandResult = true;
                MessagesToWorker.Reset.sendMessage(this.worker, command.viewport, command.primitiveType);
            } else if (this.pendingRecomputeColorsCommand) {
                const command = this.pendingRecomputeColorsCommand;
                this.pendingRecomputeColorsCommand = null;

                // console.log("Sending recompute colors command");
                this.lastCommandSendingTimestamp = performance.now();
                this.isAwaitingCommandResult = true;
                MessagesToWorker.RecomputeColors.sendMessage(this.worker, command.colorVariation);
            } else if (this.pendingPerformUpdateCommand) {
                this.performUpdateCommandThrottle.runIfAvailable(() => {
                    const command = this.pendingPerformUpdateCommand;
                    this.pendingPerformUpdateCommand = null;

                    // console.log("Sending update command");
                    this.lastCommandSendingTimestamp = performance.now();
                    this.isAwaitingCommandResult = true;
                    //在子线程执行，如何判断代码执行是在主线程还是子线程，通过断点 查看 window，子线程window是空，这个是给子线程发送指令
                    command && MessagesToWorker.PerformUpdate.sendMessage(this.worker, this.cumulatedZoom, command.viewport, command.wantedDepth, command.subdivisionBalance, command.colorVariation);
                });
            }
        }
    }

    private logCommandOutput(commandName: string): void {
        const commandDuration = performance.now() - this.lastCommandSendingTimestamp;
        if (commandDuration > 50) {
            console.log(`"${commandName}" command took ${commandDuration.toFixed(0)} ms.`);
        }
    }
}

export {
    SimulationMultithreaded,
};

