declare module 'react-plotly.js' {
  import type * as Plotly from 'plotly.js';
  import type * as React from 'react';

  interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    frames?: Plotly.Frame[];
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onInitialized?: (figure: Readonly<Plotly.Figure>, graphDiv: Readonly<HTMLDivElement>) => void;
    onUpdate?: (figure: Readonly<Plotly.Figure>, graphDiv: Readonly<HTMLDivElement>) => void;
    onPurge?: (figure: Readonly<Plotly.Figure>, graphDiv: Readonly<HTMLDivElement>) => void;
    onError?: (err: Error) => void;
    onAfterExport?: () => void;
    onAfterPlot?: () => void;
    onAnimated?: () => void;
    onAnimatingFrame?: (event: Plotly.FrameAnimationEvent) => void;
    onAnimationInterrupted?: () => void;
    onAutoSize?: () => void;
    onBeforeExport?: () => void;
    onButtonClicked?: (event: Plotly.ButtonClickEvent) => void;
    onClick?: (event: Readonly<Plotly.PlotMouseEvent>) => void;
    onClickAnnotation?: (event: Plotly.ClickAnnotationEvent) => void;
    onDeselect?: () => void;
    onDoubleClick?: () => void;
    onFramework?: () => void;
    onHover?: (event: Readonly<Plotly.PlotHoverEvent>) => void;
    onLegendClick?: (event: Readonly<Plotly.LegendClickEvent>) => boolean;
    onLegendDoubleClick?: (event: Readonly<Plotly.LegendClickEvent>) => boolean;
    onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
    onRelayouting?: (event: Plotly.PlotRelayoutEvent) => void;
    onRestyle?: (event: Plotly.PlotRestyleEvent) => void;
    onRedraw?: () => void;
    onSelected?: (event: Readonly<Plotly.PlotSelectionEvent>) => void;
    onSelecting?: (event: Readonly<Plotly.PlotSelectionEvent>) => void;
    onSliderChange?: (event: Plotly.SliderChangeEvent) => void;
    onSliderEnd?: (event: Plotly.SliderEndEvent) => void;
    onSliderStart?: (event: Plotly.SliderStartEvent) => void;
    onTransitioning?: () => void;
    onTransitionInterrupted?: () => void;
    onUnhover?: (event: Readonly<Plotly.PlotMouseEvent>) => void;
    revision?: number;
    divId?: string;
  }

  const Plot: React.ComponentType<PlotParams>;
  export default Plot;
}
