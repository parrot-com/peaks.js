/**
 * @file
 *
 * Defines the {@link SegmentHandle} class.
 *
 * @module peaks/views/segment-handle
 */

define(['konva'], function(Konva) {
  'use strict';

  function SegmentHandle(options) {
    Konva.Group.call(this);
    var self = this;

    self._segmentGroup = options.segmentGroup;
    self._segment = options.segmentGroup.segment;
    self._height = options.height;
    self._restHandleColor = options.restHandleColor;
    self._activeHandleColor = options.activeHandleColor;
    self._timeLabelBgColor = options.timeLabelBgColor;
    self._handleSize = 16;
    self._layer = options.layer;
    self._startPixel = 0;
    self._endPixel = 0;
    self._onMouseEnter = options.onMouseEnter;
    self._onMouseLeave = options.onMouseLeave;

    self._isActive = false;

    self._segmentGroup.on('mouseenter', function() {
      self._isActive = true;
      self._render();
      self._onMouseEnter(self._segment);
    });
    self._segmentGroup.on('mousemove', function(e) {
      console.log(e);
    });
    self._segmentGroup.on('mouseleave', function() {
      self._isActive = false;
      self._render();
      self._onMouseLeave(self._segment);
    });

    self._initNodes();
    self._render();
  }

  SegmentHandle.prototype = Object.create(Konva.Group.prototype);

  SegmentHandle.prototype._createHandle = function(options) {
    var self = this;
    var handleSize = self._handleSize;
    var handle = new Konva.Rect({
      width: handleSize,
      height: handleSize,
      x: 0,
      y: 0,
      fill: self._restHandleColor
      // draggable: true
    });

    // Events
    handle.on('mouseenter', function() {
      handle.fill(self._activeHandleColor);
      this._layer.draw();
    });
    handle.on('mouseleave', function() {
      handle.fill(self._restHandleColor);
      this._layer.draw();
    });

    return handle;
  };

  SegmentHandle.prototype._initNodes = function() {
    var self = this;
    var segmentGroup = self._segmentGroup;

    var segmentRect = new Konva.Rect({
      y: 0,
      height: this._height,
      fill: '#78A9D7',
      opacity: 0.3
    });
    var handleStart = self._createHandle({
      isStart: true
    });
    var handleEnd = self._createHandle({
      isStart: false
    });

    self.add(segmentRect);
    self.add(handleStart);
    self.add(handleEnd);
    self._segmentRect = segmentRect;
    self._handleStart = handleStart;
    self._handleEnd = handleEnd;
  };

  SegmentHandle.prototype._render = function() {
    if (this._isActive) {
      this._segmentRect.fill('#78A9D7');
      this._segmentRect.opacity(0.3);
    }
    else {
      this._segmentRect.fill('#676C72');
      this._segmentRect.opacity(0.2);
    }
    this._segmentRect.x(this._startPixel);
    this._segmentRect.width(this._endPixel - this._startPixel);
    this._handleStart.x(this._startPixel);
    this._handleEnd.x(this._endPixel - this._handleSize);
    // this._segmentGroup.draw();
    this._layer.draw();
  };

  SegmentHandle.prototype.update = function(options) {
    this._startPixel = options.startPixel;
    this._endPixel = options.endPixel;
    this._render();
  };

  return SegmentHandle;
});