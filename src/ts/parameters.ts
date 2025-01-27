import { Color } from "./misc/color";
import { IPoint } from "./misc/point";
import { getQueryStringValue, setQueryStringValue } from "./misc/web";
import { EPrimitiveType } from "./primitives/primitive-type-enum";

import "./page-interface-generated";


/* === IDs ============================================================ */
const controlId = {
    PRIMITIVE_TABS_ID: "primitive-tabs-id",
    DENSITY_RANGE_ID: "density-range-id",
    BALANCE_RANGE_ID: "balance-range-id",
    ZOOMING_SPEED_RANGE_ID: "zooming-speed-range-id",
    MULTITHREADED_CHECKBOX_ID: "multithreaded-checkbox-id",
    RESET_BUTTON_ID: "reset-button-id",

    PLOTTER_TABS_ID: "plotter-tabs-id",
    SCALING_RANGE_ID: "scaling-range-id",
    COLOR_VARIATION_RANGE_ID: "color-variation-range-id",
    BLENDING_CHECKBOX_ID: "blending-checkbox-id",
    SHOW_INDICATORS_CHECKBOX_ID: "show-indicators-checkbox-id",

    DISPLAY_LINES_CHECKBOX_ID: "display-lines-checkbox-id",
    THICKNESS_RANGE_ID: "thickness-range-id",
    LINES_COLOR_PICKER_ID: "lines-color-picker-id",

    DOWNLOAD_BUTTON: "result-download-id",
};

enum EPlotter {
    WEBGL = "webgl",
    CANVAS2D = "canvas2d",
}

const plotterQueryStringParamName = "plotter";
const monothreadedQueryStringParamName = "monothreaded";

type Observer = () => unknown;

function isMonothreaded(): boolean {
    return getQueryStringValue(monothreadedQueryStringParamName) === "1";
}

function getPlotter(): EPlotter {
    if (isMonothreaded()) {
        if (getQueryStringValue(plotterQueryStringParamName) === EPlotter.CANVAS2D) {
            return EPlotter.CANVAS2D;
        } else {
            return EPlotter.WEBGL;
        }
    } else {
        return EPlotter.WEBGL;
    }
}

abstract class Parameters {
    public static readonly resetObservers: Observer[] = [];
    public static readonly recomputeColorsObservers: Observer[] = [];
    public static readonly redrawObservers: Observer[] = [];
    public static readonly downloadObservers: Observer[] = [];

    public static readonly debugMode: boolean = (getQueryStringValue("debug") === "1");
    public static readonly multithreaded: boolean = !isMonothreaded();
    public static readonly plotter: EPlotter = getPlotter();

    /**
     * 图元类型 面片  三角形
     */
    public static get primitiveType(): EPrimitiveType {
        return Page.Tabs.getValues(controlId.PRIMITIVE_TABS_ID)[0] as EPrimitiveType;
    }

    /**
     * 值越小 则拆分的阈值 越小，即三角形越多
     */
    public static get depth(): number {
        return Page.Range.getValue(controlId.DENSITY_RANGE_ID);
    }

    /**
     * 切分三角形 值为1的时候为最长边的中点和顶点，值越小 越随机
     */
    public static get balance(): number {
        return Page.Range.getValue(controlId.BALANCE_RANGE_ID);
    }

    /**
     * primitive 放大的速度
     */
    public static get zoomingSpeed(): number {
        return Page.Range.getValue(controlId.ZOOMING_SPEED_RANGE_ID);
    }

    /**
     * 视口渲染的范围
     */
    public static get scaling(): number {
        return Page.Range.getValue(controlId.SCALING_RANGE_ID);
    }

    /**
     * 颜色变化
     */
    public static get colorVariation(): number {
        return 255 * Page.Range.getValue(controlId.COLOR_VARIATION_RANGE_ID);
    }

    public static get blending(): boolean {
        return Page.Checkbox.isChecked(controlId.BLENDING_CHECKBOX_ID);
    }

    public static get displayLines(): boolean {
        return Page.Checkbox.isChecked(controlId.DISPLAY_LINES_CHECKBOX_ID);
    }

    public static get isThicknessEnabled(): boolean {
        return Parameters.plotter === EPlotter.CANVAS2D;
    }
    public static get thickness(): number {
        if (Parameters.isThicknessEnabled) {
            return Page.Range.getValue(controlId.THICKNESS_RANGE_ID);
        } else {
            return 0;
        }
    }

    public static get linesColor(): Color {
        const color = Page.ColorPicker.getValue(controlId.LINES_COLOR_PICKER_ID);
        return new Color(color.r, color.g, color.b);
    }

    public static get mousePositionInPixels(): IPoint {
        const canvasSize = Page.Canvas.getSize();
        const mousePosition = Page.Canvas.getMousePosition();
        return {
            x: window.devicePixelRatio * canvasSize[0] * mousePosition[0],
            y: window.devicePixelRatio * canvasSize[1] * mousePosition[1],
        };
    }
}

function callObservers(observers: Observer[]): void {
    for (const observer of observers) {
        observer();
    }
}

const callRedraw = () => { callObservers(Parameters.redrawObservers); };
const callReset = () => {
    callObservers(Parameters.resetObservers);
    callRedraw();
};

Page.Range.addObserver(controlId.BALANCE_RANGE_ID, callReset);
Page.Button.addObserver(controlId.RESET_BUTTON_ID, callReset);
Page.Tabs.addObserver(controlId.PRIMITIVE_TABS_ID, callReset);

Page.Range.addObserver(controlId.COLOR_VARIATION_RANGE_ID, () => {
    callObservers(Parameters.recomputeColorsObservers);
    callRedraw();
});

Page.Range.addObserver(controlId.SCALING_RANGE_ID, callRedraw);
Page.Checkbox.addObserver(controlId.DISPLAY_LINES_CHECKBOX_ID, callRedraw);
Page.Canvas.Observers.canvasResize.push(callRedraw);
Page.Range.addObserver(controlId.THICKNESS_RANGE_ID, callRedraw);
Page.ColorPicker.addObserver(controlId.LINES_COLOR_PICKER_ID, callRedraw);

Page.FileControl.addDownloadObserver(controlId.DOWNLOAD_BUTTON, () => { callObservers(Parameters.downloadObservers); });

Page.Controls.setVisibility(controlId.THICKNESS_RANGE_ID, Parameters.isThicknessEnabled);

function updateIndicatorsVisibility(): void {
    Page.Canvas.setIndicatorsVisibility(Page.Checkbox.isChecked(controlId.SHOW_INDICATORS_CHECKBOX_ID));
}
Page.Checkbox.addObserver(controlId.SHOW_INDICATORS_CHECKBOX_ID, updateIndicatorsVisibility);
updateIndicatorsVisibility();

Page.Tabs.setValues(controlId.PLOTTER_TABS_ID, [Parameters.plotter]);
Page.Tabs.addObserver(controlId.PLOTTER_TABS_ID, (values: string[]) => {
    const wantedPlotter = (values[0] === EPlotter.CANVAS2D) ? EPlotter.CANVAS2D : EPlotter.WEBGL;
    Page.Tabs.clearStoredState(controlId.PLOTTER_TABS_ID);
    setQueryStringValue(plotterQueryStringParamName, wantedPlotter);
});

Page.Checkbox.setChecked(controlId.MULTITHREADED_CHECKBOX_ID, Parameters.multithreaded);
Page.Checkbox.addObserver(controlId.MULTITHREADED_CHECKBOX_ID, (checked: boolean) => {
    Page.Checkbox.clearStoredState(controlId.MULTITHREADED_CHECKBOX_ID);
    setQueryStringValue(monothreadedQueryStringParamName, checked ? null : "1");
});
Page.Controls.setVisibility(controlId.PLOTTER_TABS_ID, !Parameters.multithreaded);

export {
    EPlotter,
    Parameters,
};

