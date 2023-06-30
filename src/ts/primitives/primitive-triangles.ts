import * as Arithmetics from "../misc/arithmetics";
import { Color } from "../misc/color";
import { IPoint } from "../misc/point";
import { Rectangle } from "../misc/rectangle";
import { Zoom } from "../misc/zoom";
import { EVisibility, PrimitiveBase } from "./primitive-base";
import { EPrimitiveType } from "./primitive-type-enum";

/**
 * 基于最长边 获得一个点  分割为2个三角形
 */
class PrimitiveTriangles extends PrimitiveBase {
    public readonly primitiveType: EPrimitiveType = EPrimitiveType.TRIANGLES;

    public constructor(
        protected readonly p1: IPoint,
        protected readonly p2: IPoint,
        protected readonly p3: IPoint,
        color: Color) {
        super(color);
    }

    public get subdivisionFactor(): number {
        return 2;
    }

    /**
     * 拆分成两个三角形
     * @param subdivisionBalance 
     * @param childrenColorVariation 
     */
    public subdivide(subdivisionBalance: number, childrenColorVariation: number): void {
        this.removeChildren();

        /**
         * @param sourcePoint  最长边对面的顶点
         * @param otherPoint1  最长边顶点1
         * @param otherPoint2  最长边顶点2
         */
        const subdivideInternal = (sourcePoint: IPoint, otherPoint1: IPoint, otherPoint2: IPoint) => {
            const minRand = 0.5 * subdivisionBalance;
            const maxRand = 1 - minRand;
            const rand = Arithmetics.random(minRand, maxRand);

            // 获得两点连线的一个点
            this.subdivision = [
                sourcePoint,
                Arithmetics.interpolatePoint(otherPoint1, otherPoint2, rand),
            ];

            this.addChildren(
                new PrimitiveTriangles(sourcePoint, otherPoint1, this.subdivision[1], this.color.computeCloseColor(childrenColorVariation)),
                new PrimitiveTriangles(sourcePoint, this.subdivision[1], otherPoint2, this.color.computeCloseColor(childrenColorVariation))
            );
        };

        const distance12 = Arithmetics.squaredDistance(this.p1, this.p2);
        const distance23 = Arithmetics.squaredDistance(this.p2, this.p3);
        const distance31 = Arithmetics.squaredDistance(this.p3, this.p1);

        // 判断最长边
        if (distance12 > distance23 && distance12 > distance31) {
            subdivideInternal(this.p3, this.p1, this.p2);
        } else if (distance23 > distance12 && distance23 > distance31) {
            subdivideInternal(this.p1, this.p2, this.p3);
        } else {
            subdivideInternal(this.p2, this.p3, this.p1);
        }
    }

    public get vertices(): IPoint[] {
        return [this.p1, this.p2, this.p3];
    }

    /**
     * 将图元 顶点 基于zoom矩阵进行调整
     * @param zoom 
     * @param isRoot 
     */
    protected applyZoom(zoom: Zoom, isRoot: boolean): void {
        if (isRoot) {
            zoom.applyToPoint(this.p1);
            zoom.applyToPoint(this.p2);
            zoom.applyToPoint(this.p3);
        }
        
        //图元拆分的line
        if (this.subdivision) {
            zoom.applyToPoint(this.subdivision[1]);
        }
    }

    public computeVisibility(viewport: Rectangle): EVisibility {
        const p1InViewport = viewport.containsPoint(this.p1);
        const p2InViewport = viewport.containsPoint(this.p2);
        const p3InViewport = viewport.containsPoint(this.p3);
        if (p1InViewport && p2InViewport && p3InViewport) {
            // viewport is convex so if all vertices are in view, the whole shape is in view
            return EVisibility.FULLY_VISIBLE;
        } else if (p1InViewport || p2InViewport || p3InViewport) {
            return EVisibility.PARTIALLY_VISIBLE;
        } else if (viewport.lineIntersectsBoundaries(this.p1, this.p2) ||
            viewport.lineIntersectsBoundaries(this.p2, this.p3) ||
            viewport.lineIntersectsBoundaries(this.p3, this.p1)) {
            return EVisibility.PARTIALLY_VISIBLE;
        } else {
            // at this point, we know that the primitive is not fully contained in the viewport,
            // and that there are no intersection between edges and viewport bounds
            // => either the shape is out of view or contains the whole viewport
            if (this.isInside(viewport.topLeft)) {
                return EVisibility.COVERS_VIEW;
            } else {
                return EVisibility.OUT_OF_VIEW;
            }
        }
    }

    private isInside(point: IPoint): boolean {
        const SIDE_1_2 = Arithmetics.getSide(this.p1, this.p2, point);
        const SIDE_2_3 = Arithmetics.getSide(this.p2, this.p3, point);
        const SIDE_3_1 = Arithmetics.getSide(this.p3, this.p1, point);

        return Arithmetics.areSameSign(SIDE_1_2, SIDE_2_3, SIDE_3_1);
    }
}

export { PrimitiveTriangles };

