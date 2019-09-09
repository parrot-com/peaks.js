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
    this._peaks           = peaks;
    this._view            = view;
    this._allowEditing    = allowEditing;
    this._segmentGroups   = {};
    this._handleSize      = 16;
    this._layer           = new Konva.Layer();
    this._mouseX          = undefined;
    this._mouseY          = undefined;
    this._isMouseDragging = false;
    this._isMouseOver     = false;

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
      var redraw = false;
      var segmentGroup = self._segmentGroups[segment.id];
      var frameOffset = self._view.getFrameOffset();
      var width = self._view.getWidth();
      var frameStartTime = self._view.pixelsToTime(frameOffset);
      var frameEndTime   = self._view.pixelsToTime(frameOffset + width);

      // if (segmentGroup) {
      //   self._removeSegment(segment);
      //   redraw = true;
      // }

      if (segmentGroup) {
        redraw = true;
      }

      if (!segmentGroup && segment.isVisible(frameStartTime, frameEndTime)) {
        self._addSegmentGroup(segment);
        redraw = true;
      }

      if (redraw) {
        self._renderSegmentGroup(segmentGroup);
        self._layer.draw();
        // self.updateSegments(frameStartTime, frameEndTime);
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

    this._peaks.on('segments.select', function(segment) {
      if (!segment) {
        self._isMouseOver = false;
        self._mouseX = self._layer.getWidth() / 2;
        self._mouseY = -100;
        self._updateVisibleSegments(true);
        return;
      }

      var segmentGroupKeys = Object.keys(self._segmentGroups);

      for (var i = 0; i < segmentGroupKeys.length; i++) {
        var segmentGroup = self._segmentGroups[segmentGroupKeys[i]];
        var isMouseOver = segmentGroupKeys[i] === segment.id;

        segmentGroup.isMouseOver = isMouseOver;
      }

      var frameStartOffset = self._view.getFrameOffset();
      var x = self._view.timeToPixels(segment.startTime);
      var width = self._view.timeToPixels(segment.endTime) - x;

      self._isMouseOver = true;
      self._mouseX = x - frameStartOffset + width / 2;
      self._mouseY = self._layer.height() / 2;

      if (x > frameStartOffset + self._layer.width() || width + x < frameStartOffset) {
        var newFrameOffset = x - 100;

        self._mouseX = x - newFrameOffset + width / 2;

        self._peaks.emit('user_scroll.zoomview', newFrameOffset);
      }
      else {
        self._updateVisibleSegments(true);
      }
    });

    this._layer.on('mouseenter', function() {
      self._isMouseOver = true;
      self._updateVisibleSegments();
    });

    this._layer.on('mousemove', function() {
      self._updateVisibleSegments();
    });

    this._layer.on('mouseleave', function() {
      self._isMouseOver = false;
      self._mouseX = self._layer.getWidth() / 2;
      self._mouseY = -20;
      var segmentGroupKeys = Object.keys(self._segmentGroups);
      var redrawLayer = false;

      for (var i = 0; i < segmentGroupKeys.length; i++) {
        var segmentGroup = self._segmentGroups[segmentGroupKeys[i]];

        if (segmentGroup.isMouseOver ||
            segmentGroup.startHandle.isMouseOver ||
            segmentGroup.endHandle.isMouseOver) {
              redrawLayer = true;
            }
      }
      if (redrawLayer) {
        self._updateVisibleSegments(true);
        self._layer.draw();
      }
    });

    this._layer.on('mousedown', function() {
      self._isMouseDragging = true;
      var targettedSegmentGroup = false;
      var segmentGroupKeys = Object.keys(self._segmentGroups);
      var frameStartOffset = self._view.getFrameOffset();
      var clickedTime = self._view.pixelsToTime(
        frameStartOffset + self._mouseX
      );
      var redrawLayer = false;

      for (var i = 0; i < segmentGroupKeys.length; i++) {
        var redrawSegment = false;
        var segmentGroup = self._segmentGroups[segmentGroupKeys[i]];
        var segment = segmentGroup.segment;
        var startHandle = segmentGroup.startHandle;

        if (startHandle.isMouseOver) {
          segmentGroup.neighbours = self._findSegmentNeighbours(segmentGroup.segment);
          startHandle.isMouseDragging = true;
          startHandle.mouseStartDiffX = self._mouseX - startHandle.x();
          redrawSegment = true;
        }

        var endHandle = segmentGroup.endHandle;

        if (endHandle.isMouseOver) {
          segmentGroup.neighbours = self._findSegmentNeighbours(segmentGroup.segment);
          endHandle.isMouseDragging = true;
          endHandle.mouseStartDiffX = self._mouseX - endHandle.x() - 1;
          redrawSegment = true;
        }

        var isFocused = segmentGroup.isMouseOver;

        if (isFocused !== segment.isFocused) {
          segment.update({ isFocused: isFocused });
        }

        if (segmentGroup.isMouseOver) {
          targettedSegmentGroup = true;
          self._peaks.emit('zoomview.mousedown', {
            segmentGroup: segmentGroup,
            time: clickedTime
          });
          redrawSegment = true;
        }

        if (redrawSegment) {
          self._renderSegmentGroup(segmentGroup);
          redrawLayer = true;
        }
      }

      if (!targettedSegmentGroup) {
        self._peaks.emit('zoomview.mousedown', { time: clickedTime });
      }

      if (redrawLayer) {
        self._layer.draw();
      }
    });

    window.addEventListener('mouseup', function() {
      self._isMouseDragging = false;
      var segmentGroupKeys = Object.keys(self._segmentGroups);

      self._peaks.emit('zoomview.mouseup');

      for (var i = 0; i < segmentGroupKeys.length; i++) {
        var segmentGroup = self._segmentGroups[segmentGroupKeys[i]];
        var startHandle = segmentGroup.startHandle;
        var endHandle = segmentGroup.endHandle;

        if (startHandle.isMouseDragging || endHandle.isMouseDragging) {
          startHandle.isMouseDragging = false;
          endHandle.isMouseDragging = false;
          self._renderSegmentGroup(segmentGroup);
          self._layer.draw();
        }
        if (segmentGroup.isSegmentTouching) {
          segmentGroup.isSegmentTouching = false;
          self._renderSegmentGroup(segmentGroup);
          self._layer.draw();
        }
      }
    });

    this._peaks.on('segmentGroup.mouseenter', function(segmentGroup) {
      self._renderSegmentGroup(segmentGroup);
      self._layer.draw();
    });

    this._peaks.on('segmentGroup.mouseleave', function(segmentGroup) {
      self._renderSegmentGroup(segmentGroup);
      self._layer.draw();
    });

    this._peaks.on('segmentGroup.handle.mouseenter', function(event) {
      self._renderSegmentGroup(event.segmentGroup);
      self._layer.draw();
    });

    this._peaks.on('segmentGroup.handle.mouseleave', function(event) {
      self._renderSegmentGroup(event.segmentGroup);
      self._layer.draw();
    });
  };

  SegmentsLayer.prototype._updateVisibleSegments = function(dontFindCursor) {
    var self = this;

    if (!dontFindCursor) {
      var pos = Utils.getRelativePointerPosition(self._layer);

      self._mouseX = pos.x;
      self._mouseY = pos.y;
    }

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

    segmentGroup.emitEvents = function() {
      var x = self._mouseX;
      var y = self._mouseY;

      var isMouseOver = self._isMouseOver;
      var startHandle = segmentGroup.startHandle;
      var endHandle = segmentGroup.endHandle;
      var highlightRect = segmentGroup.highlightRect;
      var endPixel = highlightRect.x() + highlightRect.width();

      segmentGroup.highlightRectDistance = x <= highlightRect.x() ?
        highlightRect.x() - x :
        x - endPixel;

      var isSegmentMouseOver = isMouseOver && (x > highlightRect.x() &&
          x <= endPixel);

      if (isSegmentMouseOver !== segmentGroup.isMouseOver) {
        segmentGroup.isMouseOver = isSegmentMouseOver;
        if (isSegmentMouseOver) {
          self._peaks.emit('segmentGroup.mouseenter', segmentGroup);
        }
        else {
          // TODO: This fires at init.
          self._peaks.emit('segmentGroup.mouseleave', segmentGroup);
          if (startHandle.isMouseOver) {
            startHandle.isMouseOver = false;
            self._peaks.emit(
              'segmentGroup.handle.mouseleave',
              { segmentGroup: segmentGroup, isInHandle: true }
            );
          }
          if (endHandle.isMouseOver) {
            endHandle.isMouseOver = false;
            self._peaks.emit('segmentGroup.handle.mouseleave', { segmentGroup: segmentGroup });
          }
        }
      }

      var isStartHandleMouseOver = isSegmentMouseOver &&
        (x <= highlightRect.x() + 3 ||
        (x <= highlightRect.x() + startHandle.width() &&
        y <= startHandle.height()));

      if (isStartHandleMouseOver !== segmentGroup.startHandle.isMouseOver) {
        segmentGroup.startHandle.isMouseOver = isStartHandleMouseOver;

        self._peaks.emit(
          'segmentGroup.handle.mouse' + (segmentGroup.startHandle.isMouseOver ? 'enter' : 'leave'),
          { segmentGroup: segmentGroup, isInHandle: true }
        );
      }
      var isEndHandleMouseOver = isSegmentMouseOver &&
        (x >= endPixel - 3 ||
        (x >= endPixel - endHandle.width() &&
        y <= endHandle.height()));

      if (isEndHandleMouseOver !== segmentGroup.endHandle.isMouseOver) {
        segmentGroup.endHandle.isMouseOver = isEndHandleMouseOver;

        // TODO: This fires at init.
        self._peaks.emit(
          'segmentGroup.handle.mouse' + (segmentGroup.endHandle.isMouseOver ? 'enter' : 'leave'),
          { segmentGroup: segmentGroup, isInHandle: false }
        );
      }
    };

    segmentGroup.segment = segment;
    segmentGroup.restHandleColor = '#313335';
    segmentGroup.activeHandleColor = '#78A9D7';
    segmentGroup.timeLabelBgColor = '#4099EC';

    var highlightRect = new Konva.Rect({
      y: 0,
      fill: '#676C72',
      opacity: 0.2
    });

    var handleOptions = {
      handleSize: self._handleSize,
      restHandleColor: segmentGroup.restHandleColor
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
    segmentGroup.add(segmentGroup.highlightRect);
    segmentGroup.add(segmentGroup.startTimeLabel);
    segmentGroup.add(segmentGroup.endTimeLabel);
    segmentGroup.add(segmentGroup.startHandle);
    segmentGroup.add(segmentGroup.endHandle);

    self._renderSegmentGroup(segmentGroup);
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
    var handleSize = options.handleSize;
    var handle = new Konva.Rect({
      width: handleSize,
      height: handleSize,
      listening: false
    });

    handle.restHandleColor = options.restHandleColor;
    handle.activeHandleColor = options.activeHandleColor;
    handle.isStart = isStart;

    return handle;
  };

  SegmentsLayer.prototype._renderSegmentGroup = function(segmentGroup) {
    var self = this;

    var minSegmentDuration = 0.2;
    var segment = segmentGroup.segment;
    var isSegmentMouseOver = segmentGroup.isMouseOver;
    var activeRange = 100;
    var startHandleDist = 200;
    var endHandleDist = 200;
    var maxHighlightRectOpacity = 0.5;
    var highlightRectOpacity = 0.15;
    var highlightRect = segmentGroup.highlightRect;
    var doEffects = self._visibleSegmentsCount <= 30;
    var highlightRectDistance = segmentGroup.highlightRectDistance;
    var startHandle = segmentGroup.startHandle;
    var endHandle = segmentGroup.endHandle;
    var isSegmentDragging =
      self._isMouseDragging && (startHandle.isMouseDragging || endHandle.isMouseDragging);
    var isSegmentActive = isSegmentMouseOver || isSegmentDragging;
    var isSegmentTouching = segmentGroup.isSegmentTouching;
    var neighbours = segmentGroup.neighbours;

    var x = self._mouseX;
    var y = self._mouseY;
    var frameStartOffset = self._view.getFrameOffset();
    var newTime;

    if (startHandle.isMouseDragging) {
      if (x > 0) {
        var inOffset = frameStartOffset + x - startHandle.mouseStartDiffX;

        newTime = this._view.pixelsToTime(inOffset);

        if (newTime >= segment.endTime - minSegmentDuration) {
          newTime = segment.endTime - minSegmentDuration;
        }
        else if (neighbours.left) {
          if (neighbours.left.segment.endTime >= newTime) {
            neighbours.left.isSegmentTouching = true;
            self._renderSegmentGroup(neighbours.left);
            newTime = neighbours.left.segment.endTime;
          }
          else {
            neighbours.left.isSegmentTouching = false;
          }
        }

        if (newTime !== segment.startTime) {
          segment.startTime = newTime;
          self._peaks.emit('segments.dragged', { segmentGroup: segmentGroup, isInHandle: true });
        }
      }
    }
    else if (endHandle.isMouseDragging) {
      if (x <= this._view.getWidth()) {
        var outOffset = frameStartOffset + x + endHandle.width() - endHandle.mouseStartDiffX;

        newTime = this._view.pixelsToTime(outOffset);

        if (newTime <= segment.startTime + minSegmentDuration) {
          newTime = segment.startTime + minSegmentDuration;
        }
        else if (neighbours.right) {
          if (neighbours.right.segment.startTime <= newTime) {
            neighbours.right.isSegmentTouching = true;
            self._renderSegmentGroup(neighbours.right);
            newTime = neighbours.right.segment.startTime;
          }
          else {
            neighbours.right.isSegmentTouching = false;
          }
        }

        if (newTime !== segment.startTime) {
          segment.endTime = newTime;
          self._peaks.emit('segments.dragged', { segmentGroup: segmentGroup });
        }
      }
    }

    var segmentStartOffset = self._view.timeToPixels(segment.startTime);
    var segmentEndOffset   = self._view.timeToPixels(segment.endTime);

    var startPixel = segmentStartOffset - frameStartOffset;
    var endPixel   = segmentEndOffset   - frameStartOffset;

    segmentGroup.highlightRect.y(0);
    segmentGroup.highlightRect.x(startPixel);
    segmentGroup.highlightRect.width(endPixel - startPixel);
    segmentGroup.highlightRect.height(self._view.getHeight());
    segmentGroup.startHandle.x(startPixel);
    segmentGroup.endHandle.x(endPixel - endHandle.width());

    if (x && y) {
      if (highlightRectDistance < activeRange * 3 && doEffects) {
        highlightRectOpacity = maxHighlightRectOpacity -
          Math.min(
            1,
            highlightRectDistance / (activeRange * 3)
          ) * (maxHighlightRectOpacity - highlightRectOpacity);
      }

      if (isSegmentMouseOver && doEffects) {
        startHandleDist = startHandle.isMouseOver ? 0 :
          Utils.getDistance(
            { x: x, y: y },
            {
              x: Math.min(x, startHandle.x()),
              y: Math.min(y, startHandle.height())
            }
          );

        endHandleDist = endHandle.isMouseOver ? 0 :
          Utils.getDistance(
            { x: x, y: y },
            {
              x: Math.max(x, endHandle.x()),
              y: Math.min(y, endHandle.height())
            }
          );
      }
    }

    var fillColor = segmentGroup.restHandleColor;

    if (self._isMouseDragging && isSegmentTouching) {
      fillColor = '#de9866';
      highlightRectOpacity = 0.3;
    }
    else {
      fillColor = segmentGroup[(isSegmentMouseOver ? 'active' : 'rest') + 'HandleColor'];
    }
    if (segment.isFocused) {
      fillColor = '#66DE9D';
    }

    var startHandleOpacity = startHandle.isMouseOver ? 0.5 : 0;
    var endHandleOpacity = startHandle.isMouseOver ? 0.5 : 0;

    if (doEffects) {
      startHandleOpacity = isSegmentActive ?
        Math.max(0.2, 1 - Math.min(startHandleDist / activeRange)) : 0;
      endHandleOpacity = isSegmentActive ?
        Math.max(0.2, 1 - Math.min(endHandleDist / activeRange)) : 0;
    }

    highlightRect.opacity(
      isSegmentActive || segment.isFocused ?
        maxHighlightRectOpacity - 0.25 :
        Math.min(highlightRectOpacity, 0.5)
    );
    highlightRect.fill(fillColor);

    if (
      highlightRect.width() >
      startHandle.width() + endHandle.width()
    ) {
      // TODO: refactor into functions
      startHandle.visible(isSegmentMouseOver || segment.isFocused || isSegmentDragging);
      startHandle.opacity(
        isSegmentDragging || startHandle.isMouseDragging || segment.isFocused ?
          0.5 : startHandleOpacity
      );
      endHandle.visible(isSegmentMouseOver || segment.isFocused || isSegmentDragging);
      endHandle.opacity(
        isSegmentDragging || endHandle.isMouseDragging || segment.isFocused ? 0.5 : endHandleOpacity
      );
      startHandle.fill(
        // eslint-disable-next-line no-nested-ternary
        segment.isFocused ? '#66DE9D' :
          startHandle.isMouseOver ?
          segmentGroup.activeHandleColor :
          segmentGroup.restHandleColor
      );
      endHandle.fill(
        // eslint-disable-next-line no-nested-ternary
        segment.isFocused ? '#66DE9D' :
          endHandle.isMouseOver ?
          segmentGroup.activeHandleColor :
          segmentGroup.restHandleColor
      );
    }
    else {
      startHandle.visible(false);
      endHandle.visible(false);
    }
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
    var self = this;

    this._mouseCapturingRect.width(this._layer.getWidth());
    this._mouseCapturingRect.height(this._layer.getHeight());
    // Update segments in visible time range.
    var segments = this._peaks.segments.find(startTime, endTime);

    var count = segments.length;

    this._visibleSegmentsCount = count;
    segments.forEach(function(segment) {
      var segmentGroup = self._findOrAddSegmentGroup(segment);

      if (segmentGroup) {
        self._renderSegmentGroup(segmentGroup);
        segmentGroup.emitEvents();
      }
    });

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
      // .sort(function(a, b) {
      //   return a.startTime > b.startTime ? 1 : -1;
      // });
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
