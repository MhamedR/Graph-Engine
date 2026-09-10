export class GraphNode {
  constructor(
    public readonly id: string,
    public readonly label: string = id,
  ) {}
}
