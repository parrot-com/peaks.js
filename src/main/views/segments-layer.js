/**
 * @file
 *
 * Defines the {@link SegmentsLayer} class.
 *
 * @module peaks/views/segments-layer
 */

define([
  'peaks/views/waveform-shape',
  'peaks/views/segment-handle',
  'peaks/waveform/waveform.utils',
  'konva'
  ], function(WaveformShape, SegmentHandle, Utils, Konva) {
  'use strict';

  /**
   * Creates a Konva.Layer that displays segment markers against the audio
   * waveform.
   *
   * @class
   * @alias SegmentsLayer
   *
   * @param {Peaks} peaks
   * @param {WaveformOverview|WaveformZoomView} view
   * @param {Boolean} allowEditing
   */

  function SegmentsLayer(peaks, view, allowEditing) {
    this._peaks         = peaks;
    this._view          = view;
    this._allowEditing  = allowEditing;
    this._segmentGroups = {};
    this._handleSize    = 16;
    this._layer         = new Konva.Layer();
    this._mouseX        = undefined;
    this._mouseY        = undefined;

    this._mouseCapturingRect = new Konva.Rect({
      x: 0,
      y: 0
    });

    this._layer.add(this._mouseCapturingRect);
    this._registerEventHandlers();
  }

  /**
   * Adds the layer to the given {Konva.Stage}.
   *
   * @param {Konva.Stage} stage
   */

  SegmentsLayer.prototype.addToStage = function(stage) {
    stage.add(this._layer);
  };

  SegmentsLayer.prototype._registerEventHandlers = function() {
    var self = this;

    this._peaks.on('segments.update', function(segment) {
      // TODO
      var redraw = false;
      var segmentGroup = self._segmentGroups[segment.id];
      var frameOffset = self._view.getFrameOffset();
      var width = self._view.getWidth();
      var frameStartTime = self._view.pixelsToTime(frameOffset);
      var frameEndTime   = self._view.pixelsToTime(frameOffset + width);

      if (segmentGroup) {
        self._removeSegment(segment);
        redraw = true;
      }

      if (segment.isVisible(frameStartTime, frameEndTime)) {
        self._addSegmentGroup(segment);
        redraw = true;
      }

      if (redraw) {
        // self.updateSegments(frameStartTime, frameEndTime);
        self._updateSegment(segment);
      }
    });

    this._peaks.on('segments.add', function(segments) {
      var frameOffset = self._view.getFrameOffset();
      var width = self._view.getWidth();

      var frameStartTime = self._view.pixelsToTime(frameOffset);
      var frameEndTime   = self._view.pixelsToTime(frameOffset + width);

      segments.forEach(function(segment) {
        if (segment.isVisible(frameStartTime, frameEndTime)) {
          self._addSegmentGroup(segment);
        }
      });

      self.updateSegments(frameStartTime, frameEndTime);
    });

    this._peaks.on('segments.remove', function(segments) {
      segments.forEach(function(segment) {
        self._removeSegment(segment);
      });

      self._layer.draw();
    });

    this._peaks.on('segments.remove_all', function() {
      self._layer.removeChildren();
      self._segmentGroups = {};

      self._layer.draw();
    });

    this._peaks.on('segments.dragged', function(segment) {
      self._updateSegment(segment);
      self._layer.draw();
    });

    this._layer.on('mousemove', function() {
      self._updateVisibleSegments();
    });

    this._layer.on('mousedown', function() {
      self._isMouseDown = true;
      self._mouseStartX = self._mouseX;
      self._updateVisibleSegments();
    });

    this._layer.on('mouseup', function() {
      self._isMouseDown = false;
      self._updateVisibleSegments();
    });
  };

  SegmentsLayer.prototype._updateVisibleSegments = function() {
    var self = this;
    var pos = Utils.getRelativePointerPosition(self._layer);

    self._mouseX = pos.x;
    self._mouseY = pos.y;

    var frameOffset = self._view.getFrameOffset();
    var width = self._view.getWidth();

    var frameStartTime = self._view.pixelsToTime(frameOffset);
    var frameEndTime   = self._view.pixelsToTime(frameOffset + width);

    self.updateSegments(frameStartTime, frameEndTime);

    self._layer.draw();
  };

  /**
   * Creates the Konva UI objects for a given segment.
   *
   * @private
   * @param {Segment} segment
   * @returns {Konva.Group}
   */

  SegmentsLayer.prototype._createSegmentGroup = function(segment) {
    var self = this;

    var segmentGroup = new Konva.Group();

    segmentGroup.segment = segment;

    // segmentGroup.handle = new SegmentHandle({
    //   segmentGroup: segmentGroup,
    //   height: self._view.getHeight(),
    //   layer: self._layer,
    //   restHandleColor: '#646D7A',
    //   activeHandleColor: '#3675D4',
    //   timeLabelBgColor: '#30B5EE',
    //   onMouseEnter: self._onSegmentMouseEnter.bind(self),
    //   onMouseLeave: self._onSegmentMouseLeave.bind(self)
    // });

    var highlightRect = new Konva.Rect({
      x: 50,
      y: 50,
      fill: '#676C72',
      width: 80,
      height: 80,
      opacity: 0.2
    });

    var handleOptions = {
      layer: self._layer,
      segmentGroup: segmentGroup,
      handleSize: self._handleSize,
      restHandleColor: '#313335',
      activeHandleColor: '#78A9D7',
      timeLabelBgColor: '#4099EC'
    };

    var timeLabelOptions = {
      segmentGroup: segmentGroup,
      labelHeight: self._handleSize,
      timeLabelBgColor: '#4099EC'
    };

    segmentGroup.highlightRect = highlightRect;
    segmentGroup.startHandle = self._createHandle(handleOptions, true);
    segmentGroup.endHandle = self._createHandle(handleOptions);
    segmentGroup.startTimeLabel = self._crateTimeLabel(timeLabelOptions, true);
    segmentGroup.endTimeLabel = self._crateTimeLabel(timeLabelOptions);
    segmentGroup.startHandle.checkCursorInRange();
    segmentGroup.endHandle.checkCursorInRange();
    // segmentGroup.add(segmentGroup.handle);
    segmentGroup.add(segmentGroup.highlightRect);
    segmentGroup.add(segmentGroup.startTimeLabel);
    segmentGroup.add(segmentGroup.endTimeLabel);
    segmentGroup.add(segmentGroup.startHandle);
    segmentGroup.add(segmentGroup.endHandle);

    return segmentGroup;
  };

  SegmentsLayer.prototype._crateTimeLabel = function(options, isStart) {
    var segmentGroup = options.segmentGroup;
    var labelGroup = new Konva.Group();
    var labelHeight = options.labelHeight;
    var timeLabelBgRect = new Konva.Rect({
      height: labelHeight,
      fill: options.timeLabelBgColor,
      listening: false
    });

    labelGroup.timeLabelBgRect = timeLabelBgRect;
    labelGroup.isStart = isStart;
    labelGroup.update = function() {
      var highlightRect = segmentGroup.highlightRect;

      labelGroup.timeLabelBgRect.width(60);
      labelGroup.x(
        labelGroup.isStart ?
        highlightRect.x() + segmentGroup.startHandle.width() :
        highlightRect.x() + highlightRect.width() - segmentGroup.endHandle.width() -
        labelGroup.timeLabelBgRect.width()
      );
    };

    labelGroup.add(timeLabelBgRect);
    return labelGroup;
  };

  SegmentsLayer.prototype._createHandle = function(options, isStart) {
    var self = this;
    var segmentGroup = options.segmentGroup;
    var handleSize = options.handleSize;
    var handle = new Konva.Rect({
      width: handleSize,
      height: handleSize,
      fill: options.restHandleColor,
      listening: false
    });

    handle.restHandleColor = options.restHandleColor;
    handle.activeHandleColor = options.activeHandleColor;
    handle.isStart = isStart;

    handle.checkCursorInRange = function() {
      var isStart = handle.isStart;
      var isMouseOver = false;
      var isSegmentMouseOver = false;
      var activeRange = 50;
      var distance = 100;
      var maxHighlightRectOpacity = 0.4;
      var highlightRectOpacity = 0.1;
      var highlightRect = segmentGroup.highlightRect;

      var x = self._mouseX;
      var y = self._mouseY;

      if (x && y) {
        var handleX = handle.width() + highlightRect.x();
        var highlightRectDistance = x < highlightRect.x() ?
          highlightRect.x() - x :
          x - (highlightRect.x() + highlightRect.width());

        isSegmentMouseOver = x >= highlightRect.x() &&
          x <= highlightRect.x() + highlightRect.width();

        if (self._isMouseDown && isSegmentMouseOver) {
          highlightRect.x(x);
          console.log(x);
          // highlightRect.width()
        }
        if (isSegmentMouseOver !== segmentGroup.isMouseOver) {
          self._peaks.emit(
            'segments.' + (isSegmentMouseOver ? 'mouseenter' : 'mouseleave'),
            segmentGroup.segment
          );
        }
        segmentGroup.isMouseOver = isSegmentMouseOver;
        highlightRectOpacity = maxHighlightRectOpacity -
          Math.min(
            1,
            highlightRectDistance / (activeRange * 3)
          ) * (maxHighlightRectOpacity - highlightRectOpacity);

        if (isStart) {
          isMouseOver = isSegmentMouseOver && x <= handleX && y <= handle.height();
          distance = isMouseOver ? 0 :
            Utils.getDistance(
              { x: x, y: y },
              {
                x: Math.min(x, handleX),
                y: Math.min(y, handle.height())
              }
            );
        }
        else {
          handleX = highlightRect.x() + highlightRect.width() - handle.width();
          isMouseOver = isSegmentMouseOver && x >= handleX && y <= handle.height();
          distance = isMouseOver ? 0 :
            Utils.getDistance(
              { x: x, y: y },
              {
                x: Math.max(x, handleX),
                y: Math.min(y, handle.height())
              }
            );
        }
      }

      var fillColor = segmentGroup.isMouseOver ? handle.activeHandleColor : handle.restHandleColor;
      var opacity = segmentGroup && segmentGroup.isMouseOver ?
        Math.max(0.2, 1 - Math.min(distance / activeRange)) : 0;

      highlightRect.opacity(
        isSegmentMouseOver ? maxHighlightRectOpacity : highlightRectOpacity
      );
      highlightRect.fill(fillColor);
      handle.opacity(opacity);
      handle.fill(isMouseOver ? handle.activeHandleColor : handle.restHandleColor);

      var labelGroup = isStart ? segmentGroup.startTimeLabel : segmentGroup.endTimeLabel;

      labelGroup.visible(isMouseOver);
      if (isMouseOver) {
        labelGroup.update();
      }
      return isMouseOver;
    };

    return handle;
  };

  SegmentsLayer.prototype._onHandleMouseEnter = function(event) {
    console.log(event);
  };

  SegmentsLayer.prototype._createSegmentGroupOld = function(segment) {
    var self = this;

    var segmentGroup = new Konva.Group();

    segmentGroup.segment = segment;

    segmentGroup.waveformShape = new WaveformShape({
      color: segment.color,
      view: self._view,
      segment: segment
    });

    segmentGroup.rectWindow = self._peaks.options.createSegmentRectangle({
      height:       self._view.getHeight(),
      segmentGroup: segmentGroup,
      segment:      segment,
      layer:        self._layer,
      onMouseEnter: self._onRectWindowMouseEnter.bind(self),
      onMouseLeave: self._onRectWindowMouseLeave.bind(self)
    });

    // Set up event handlers to show/hide the segment label text when the user
    // hovers the mouse over the segment.

    segmentGroup.waveformShape.on('mouseenter', function(event) {
      if (!event.target.parent) {
        self._peaks.logger('No parent for object:', event.target);
        return;
      }

      event.target.parent.label.show();
      self._layer.draw();
      self._peaks.emit('segments.mouseenter', event.target._segment);
    });

    segmentGroup.waveformShape.on('mouseleave', function(event) {
      if (!event.target.parent) {
        self._peaks.logger('No parent for object:', event.target);
        return;
      }

      event.target.parent.label.hide();
      self._layer.draw();
      self._peaks.emit('segments.mouseleave', event.target._segment);
    });

    segmentGroup.waveformShape.on('click', function(event) {
      if (!event.target.parent) {
        self._peaks.logger('No parent for object:', event.target);
        return;
      }

      self._peaks.emit('segments.click', event.target._segment);
      console.log('one click');
    });

    segmentGroup.waveformShape.on('dblclick', function(event) {
      console.log('double click');
      console.log(event);
    });

    segmentGroup.add(segmentGroup.rectWindow);
    segmentGroup.add(segmentGroup.waveformShape);

    segmentGroup.label = self._peaks.options.createSegmentLabel(segmentGroup, segment);
    segmentGroup.label.hide();
    segmentGroup.add(segmentGroup.label);

    var editable = self._allowEditing && segment.editable;

    if (editable) {
      segmentGroup.inMarker = this._peaks.options.createSegmentMarker({
        draggable:    editable,
        height:       this._view.getHeight(),
        viewWidth:    this._view.getWidth(),
        color:        this._peaks.options.inMarkerColor,
        inMarker:     true,
        segmentGroup: segmentGroup,
        segment:      segment,
        layer:        self._layer,
        onDrag:       editable ? self._onSegmentHandleDrag.bind(self) : null,
        onMouseEnter: self._onSegmentHandleMouseEnter.bind(self),
        onMouseLeave: self._onSegmentHandleMouseLeave.bind(self),
        findSegmentNeighbours: self._findSegmentNeighbours.bind(self)
      });

      segmentGroup.add(segmentGroup.inMarker);

      segmentGroup.outMarker = this._peaks.options.createSegmentMarker({
        draggable:    editable,
        height:       this._view.getHeight(),
        viewWidth:    this._view.getWidth(),
        color:        this._peaks.options.outMarkerColor,
        inMarker:     false,
        segmentGroup: segmentGroup,
        segment:      segment,
        layer:        self._layer,
        onDrag:       editable ? self._onSegmentHandleDrag.bind(self) : null,
        onMouseEnter:  self._onSegmentHandleMouseEnter.bind(self),
        onMouseLeave:   self._onSegmentHandleMouseLeave.bind(self),
        findSegmentNeighbours: self._findSegmentNeighbours.bind(self)
      });

      segmentGroup.add(segmentGroup.outMarker);
    }

    return segmentGroup;
  };

  SegmentsLayer.prototype._onSegmentMouseEnter = function(segment) {
    this._peaks.emit('segments.mouseenter', segment);
  };

  SegmentsLayer.prototype._onSegmentMouseLeave = function(segment) {
    this._peaks.emit('segments.mouseleave', segment);
  };

  /**
   * Adds a Konva UI object to the layer for a given segment.
   *
   * @private
   * @param {Segment} segment
   * @returns {Konva.Group}
   */

  SegmentsLayer.prototype._addSegmentGroup = function(segment) {
    var segmentGroup = this._createSegmentGroup(segment);

    this._layer.add(segmentGroup);

    this._segmentGroups[segment.id] = segmentGroup;

    return segmentGroup;
  };

  /**
   * @param {Konva.Group} segmentGroup
   * @param {Segment} segment
   */

  SegmentsLayer.prototype._onSegmentHandleDrag = function(segmentGroup, segment, isInMarker) {
    var frameOffset = this._view.getFrameOffset();
    var width = this._view.getWidth();

    var inMarkerX  = segmentGroup.inMarker.getX();
    var outMarkerX = segmentGroup.outMarker.getX();

    if (isInMarker && inMarkerX > 0) {
      var inOffset = frameOffset +
                     inMarkerX -
                     segmentGroup.inMarker.getWidth();

      segment.startTime = this._view.pixelsToTime(inOffset);
    }

    if (!isInMarker && outMarkerX < width) {
      var outOffset = frameOffset + outMarkerX + segmentGroup.outMarker.getWidth();

      segment.endTime = this._view.pixelsToTime(outOffset);
    }

    segment.isInMarker = isInMarker;
    this._peaks.emit('segments.dragged', segment);
  };

  /**
   * Updates the positions of all displayed segments in the view.
   *
   * @param {Number} startTime The start of the visible range in the view,
   *   in seconds.
   * @param {Number} endTime The end of the visible range in the view,
   *   in seconds.
   */

  SegmentsLayer.prototype.updateSegments = function(startTime, endTime) {
    this._mouseCapturingRect.width(this._layer.getWidth());
    this._mouseCapturingRect.height(this._layer.getHeight());
    // Update segments in visible time range.
    var segments = this._peaks.segments.find(startTime, endTime);

    var count = segments.length;

    segments.forEach(this._updateSegment.bind(this));

    // TODO: in the overview all segments are visible, so no need to check
    count += this._removeInvisibleSegments(startTime, endTime);

    if (count > 0) {
      this._layer.draw();
    }
  };

  /**
   * @private
   * @param {Segment} segment
   */

  SegmentsLayer.prototype._updateSegment = function(segment) {
    var self = this;
    var screenWidth = self._view.getWidth();
    var segmentGroup = self._findOrAddSegmentGroup(segment);

    var segmentStartOffset = self._view.timeToPixels(segment.startTime);
    var segmentEndOffset   = self._view.timeToPixels(segment.endTime);

    var frameStartOffset = self._view.getFrameOffset();
    // var frameEndOffset   = frameStartOffset + self._view.getWidth();

    var startPixel = segmentStartOffset - frameStartOffset;
    var endPixel   = segmentEndOffset   - frameStartOffset;

    // segmentGroup.handle.update({
    //   startPixel: startPixel,
    //   endPixel: endPixel
    // });
    segmentGroup.highlightRect.y(0);
    segmentGroup.highlightRect.x(startPixel);
    segmentGroup.highlightRect.width(endPixel - startPixel);
    segmentGroup.highlightRect.height(self._view.getHeight());

    segmentGroup.highlightRect.baseOpacity = 0.2;
    // TODO: Finish this cool effect sometimes
    // segmentGroup.baseOpacity = 1 - Math.abs(
    //   Math.sin(
    //     (startPixel + (endPixel - startPixel) / 2
    //     - screenWidth / 2) / screenWidth * Math.PI));
    segmentGroup.highlightRect.opacity(segmentGroup.highlightRect.baseOpacity);
    function setSizeAndPosForHandle(handle) {
      handle.x(handle.isStart ? startPixel : endPixel - handle.width());
      handle.width(self._handleSize);
      handle.height(self._handleSize);
    }

    setSizeAndPosForHandle(segmentGroup.startHandle);
    setSizeAndPosForHandle(segmentGroup.endHandle);
    segmentGroup.startHandle.checkCursorInRange();
    segmentGroup.endHandle.checkCursorInRange();
  };

  /**
   * @private
   * @param {Segment} segment
   */

  SegmentsLayer.prototype._findOrAddSegmentGroup = function(segment) {
    var segmentGroup = this._segmentGroups[segment.id];

    if (!segmentGroup) {
      segmentGroup = this._addSegmentGroup(segment);
    }

    return segmentGroup;
  };

  /**
   * Removes any segments that are not visible, i.e., are not within and do not
   * overlap the given time range.
   *
   * @private
   * @param {Number} startTime The start of the visible time range, in seconds.
   * @param {Number} endTime The end of the visible time range, in seconds.
   * @returns {Number} The number of segments removed.
   */

  SegmentsLayer.prototype._removeInvisibleSegments = function(startTime, endTime) {
    var count = 0;

    for (var segmentId in this._segmentGroups) {
      if (Object.prototype.hasOwnProperty.call(this._segmentGroups, segmentId)) {
        var segment = this._segmentGroups[segmentId].segment;

        if (!segment.isVisible(startTime, endTime)) {
          this._removeSegment(segment);
          count++;
        }
      }
    }

    return count;
  };

  /**
   * Removes the given segment from the view.
   *
   * @param {Segment} segment
   */

  SegmentsLayer.prototype._removeSegment = function(segment) {
    var segmentGroup = this._segmentGroups[segment.id];

    if (segmentGroup) {
      segmentGroup.destroyChildren();
      segmentGroup.destroy();
      delete this._segmentGroups[segment.id];
    }
  };

  /**
   * Toggles visibility of the segments layer.
   *
   * @param {Boolean} visible
   */

  SegmentsLayer.prototype.setVisible = function(visible) {
    this._layer.setVisible(visible);
  };

  /**
   * Adjusts the amplitude scale of any waveform segments shown in the view.
   *
   * @param {Number} scale The new amplitude scale factor
   */

  SegmentsLayer.prototype.setAmplitudeScale = function(scale) {
    var updated = false;

    for (var segmentId in this._segmentGroups) {
      if (Object.prototype.hasOwnProperty.call(this._segmentGroups, segmentId)) {
        var segmentGroup = this._segmentGroups[segmentId];

        segmentGroup.waveformShape.setAmplitudeScale(scale);
        updated = true;
      }
    }

    if (updated) {
      this._layer.draw();
    }
  };

  SegmentsLayer.prototype._findSegmentNeighbours = function(segment) {
    var self = this;
    var frameOffset = self._view.getFrameOffset();
    var width = self._view.getWidth();
    var frameStartTime = self._view.pixelsToTime(frameOffset);
    var frameEndTime   = self._view.pixelsToTime(frameOffset + width);
    var segmentGroups  = self._segmentGroups;
    var segments = this._peaks.segments.find(frameStartTime, frameEndTime);
    var segmentIndex = -1;

    for (var i = 0; i < segments.length; i++) {
      if (segments[i].id === segment.id) {
        segmentIndex = i;
        break;
      }
    }

    return {
      left: segmentIndex > 0 ? segmentGroups[segments[segmentIndex - 1].id] : undefined,
      right: segmentIndex < segments.length - 1 ?
        segmentGroups[segments[segmentIndex + 1].id] : undefined
    };
  };

  return SegmentsLayer;
});
