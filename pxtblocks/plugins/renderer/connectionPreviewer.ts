import * as Blockly from "blockly";

export class ConnectionPreviewer extends Blockly.InsertionMarkerPreviewer {
    static CONNECTION_INDICATOR_RADIUS = 9;

    protected connectionLine: SVGLineElement;
    protected draggedConnectionIndicator: SVGElement;
    protected staticConnection: Blockly.RenderedConnection;
    protected staticConnectionIndicator: SVGElement;

    previewConnection(draggedConn: Blockly.RenderedConnection, staticConn: Blockly.RenderedConnection): void {
        super.previewConnection(draggedConn, staticConn);
        if (staticConn.type === Blockly.ConnectionType.INPUT_VALUE || staticConn.type === Blockly.ConnectionType.OUTPUT_VALUE) {
            this.showDraggedIndicatorWithLine(draggedConn, staticConn);
        }
    }

    previewReplacement(draggedConn: Blockly.RenderedConnection, staticConn: Blockly.RenderedConnection, replacedBlock: Blockly.BlockSvg): void {
        super.previewReplacement(draggedConn, staticConn, replacedBlock);
        this.showDraggedIndicatorWithLine(draggedConn, staticConn);
    }

    private showDraggedIndicatorWithLine(draggedConn: Blockly.RenderedConnection, staticConn: Blockly.RenderedConnection) {
        if (!this.connectionLine) {
            this.connectionLine = Blockly.utils.dom.createSvgElement(
                'line',
                {
                    'class': 'blocklyConnectionLine',
                    'x1': 0,
                    'y1': 0,
                    'x2': 0,
                    'y2': 0
                },
                draggedConn.sourceBlock_.getSvgRoot());

            this.draggedConnectionIndicator = this.createConnectionIndicator(draggedConn.sourceBlock_.getSvgRoot(), draggedConn);
            const staticIndicatorParent = staticConn.sourceBlock_.getSvgRoot().querySelector(":scope>.blocklyConnectionIndicatorParent") as SVGElement;
            this.staticConnectionIndicator = this.createConnectionIndicator(staticIndicatorParent, staticConn);
        }
        this.staticConnectionIndicator.parentElement.appendChild(this.staticConnectionIndicator);

        const radius = ConnectionPreviewer.CONNECTION_INDICATOR_RADIUS;
        const offset = draggedConn.getOffsetInBlock();

        const absDrag = Blockly.utils.Coordinate.sum(
            draggedConn.sourceBlock_.getRelativeToSurfaceXY(),
            offset
        );
        const absStatic = Blockly.utils.Coordinate.sum(
            staticConn.sourceBlock_.getRelativeToSurfaceXY(),
            staticConn.getOffsetInBlock()
        );

        const dx = absStatic.x - absDrag.x;
        const dy = absStatic.y - absDrag.y;
        // Offset the line by the radius of the indicator to prevent overlap
        const atan = Math.atan2(dy, dx);

        const len = Math.sqrt(dx * dx + dy * dy);
        const isMouseDrag = Blockly.Gesture.inProgress();
        // When the indicators are overlapping, or if the drag is keyboard driven, we hide the line
        if (len < radius * 2 + 1 || !isMouseDrag) {
            Blockly.utils.dom.addClass(this.connectionLine, "hidden");
        } else if (isMouseDrag) {
            Blockly.utils.dom.removeClass(this.connectionLine, "hidden");
            this.connectionLine.setAttribute("x1", String(offset.x + Math.cos(atan) * radius));
            this.connectionLine.setAttribute("y1", String(offset.y + Math.sin(atan) * radius));

            this.connectionLine.setAttribute("x2", String(offset.x + dx - Math.cos(atan) * radius));
            this.connectionLine.setAttribute("y2", String(offset.y + dy - Math.sin(atan) * radius));
        }
    }

    hidePreview(): void {
        super.hidePreview();
        if (this.connectionLine) {
            this.connectionLine.remove();
            this.connectionLine = null;
            this.draggedConnectionIndicator.remove();
            this.draggedConnectionIndicator = null;
            this.staticConnectionIndicator.remove();
            this.staticConnectionIndicator = null;
            this.staticConnection = null;
        }
    }

    protected createConnectionIndicator(parent: SVGElement, connection: Blockly.RenderedConnection): SVGElement {
        const result = Blockly.utils.dom.createSvgElement('g',
            { 'class': 'blocklyInputConnectionIndicator' },
            parent);
        Blockly.utils.dom.createSvgElement('circle',
            { 'r': ConnectionPreviewer.CONNECTION_INDICATOR_RADIUS }, result);
        const offset = connection.getOffsetInBlock();
        result.setAttribute('transform',
            'translate(' + offset.x + ',' + offset.y + ')');
        return result;
    }
}