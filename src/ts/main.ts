import { Color } from "./color/color";
import { ILine, ILinesBatch, PlotterCanvas2D } from "./plotter/plotter-canvas-2d";

// import { Parameters } from "./parameters";

import "./page-interface-generated";
import { EOrientation, Primitive } from "./primitives/primitive";


function main(): void {
    const plotter = new PlotterCanvas2D();
    const backgroundColor = new Color(255, 128, 128);

    const basePrimitive = new Primitive({ x: 0, y: 0 }, { x: 512, y: 0 }, { x: 0, y: 512 }, { x: 512, y: 512 }, EOrientation.VERTICAl);

    const layers: Primitive[][] = [];
    {
        layers.push([basePrimitive]);

        const NB_LAYERS = 10;
        for (let i = 0; i < NB_LAYERS; i++) {
            const lastlayer: Primitive[] = layers[layers.length - 1];

            let newLayer: Primitive[] = [];
            for (const parentPrimitive of lastlayer) {
                newLayer = newLayer.concat(parentPrimitive.subdivide());
            }

            layers.push(newLayer);
        }
    }

    const linesBatches: ILinesBatch[] = [];
    {
        const MAX_THICKNESS = 2;

        for (let iLayer = 0; iLayer < layers.length - 1; iLayer++) {
            const layer = layers[iLayer];

            const lines: ILine[] = [];
            for (const primitive of layer) {
                lines.push({
                    p1: primitive.subdivision[0],
                    p2: primitive.subdivision[1],
                });
            }

            linesBatches.push({
                lines,
                color: Color.BLACK,
                thickness: 1 + MAX_THICKNESS * (layers.length - 2 - iLayer) / (layers.length - 2),
            });
        }
    }

    function mainLoop(): void {
        plotter.initialize(backgroundColor);
        plotter.drawLines(linesBatches);

        requestAnimationFrame(mainLoop);
    }
    mainLoop();
}

main();
