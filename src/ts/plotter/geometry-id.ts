let nextFreeId = 0;

class GeometryId {
    public static new(): GeometryId {
        return new GeometryId(nextFreeId++, 0);
    }

    /**
     * dehydrated   重新激活”或“重新实现动态行为
     * @param dehydrated 
     * @returns 
     */
    public static rehydrate(dehydrated: GeometryId): GeometryId {
        return new GeometryId(dehydrated.id, dehydrated.version);
    }

    public copy(): GeometryId {
        return new GeometryId(this.id, this.version);
    }

    public isSameAs(other: GeometryId): boolean {
        return other !== null && this.id === other.id && this.version === other.version;
    }

    public registerChange(): void {
        this.version++;
    }

    private constructor(
        public readonly id: number,
        private version: number
    ) { }
}

export {
    GeometryId,
};
