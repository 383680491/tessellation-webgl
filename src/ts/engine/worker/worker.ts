import { Color } from "../../misc/color";
import { Rectangle } from "../../misc/rectangle";
import { Zoom } from "../../misc/zoom";
import { EPrimitiveType } from "../../primitives/primitive-type-enum";
import * as MessagesFromMain from "./messages/to-worker/messages";
import { WorkerEngine } from "./worker-engine";


const engine = new WorkerEngine();

//这里是子线程逻辑
MessagesFromMain.PerformUpdate.addListener((zoomToApply: Zoom, viewport: Rectangle, wantedDepth: number, subdivisionBalance: number, colorVariation: number) => {
    engine.performUpdate(zoomToApply, viewport, wantedDepth, subdivisionBalance, colorVariation);
});

MessagesFromMain.Reset.addListener((viewport: Rectangle, primitiveType: EPrimitiveType) => {
    engine.reset(viewport, primitiveType);
});

MessagesFromMain.RecomputeColors.addListener((colorVariation: number) => {
    engine.recomputeColors(colorVariation);
});

MessagesFromMain.DownloadAsSvg.addListener((width: number, height: number, scaling: number, backgroundColor: Color, linesColor?: Color) => {
    engine.downloadAsSvg(width, height, scaling, backgroundColor, linesColor);
});

