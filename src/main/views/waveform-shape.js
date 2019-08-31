/**
 * @file
 *
 * Defines the {@link WaveformShape} class.
 *
 * @module peaks/views/waveform-shape
 */

define(['peaks/waveform/waveform.utils', 'konva'], function(Utils, Konva) {
  'use strict';

  /**
   * Scales the waveform data for drawing on a canvas context.
   *
   * @param {Number} amplitude The waveform data point amplitude.
   * @param {Number} height The height of the waveform, in pixels.
   * @param {Number} scale Amplitude scaling factor.
   * @returns {Number} The scaled waveform data point.
   */

  function scaleY(amplitude, height, scale) {
    var range = 256;
    var offset = 128;

    var scaledAmplitude = (amplitude * scale + offset) * height / range;

    return height - Utils.clamp(height - scaledAmplitude, 0, height);
  }

  /**
   * Waveform shape options.
   *
   * @typedef {Object} WaveformShapeOptions
   * @global
   * @property {String} color Waveform color.
   * @property {WaveformOverview|WaveformZoomView} view The view object
   *   that contains the waveform shape.
   * @property {Segment?} segment If given, render a waveform image
   *   covering the segment's time range. Otherwise, render the entire
   *   waveform duration.
   */

  /**
   * Creates a Konva.Shape object that renders a waveform image.
   *
   * @class
   * @alias WaveformShape
   *
   * @param {WaveformShapeOptions} options
   */

  function WaveformShape(options) {
    // super
    Konva.Shape.call(this, {
      fill: options.color
    });

    this._view = options.view;
    this._segment = options.segment;
    this._scale = 1.0;

    this.sceneFunc(this._sceneFunc);
    this.listening(false);
  }

  // class extension
  WaveformShape.prototype = Object.create(Konva.Shape.prototype);

  WaveformShape.prototype.setAmplitudeScale = function(scale) {
    this._scale = scale;
  };

  WaveformShape.prototype._sceneFunc = function(context) {
    var frameOffset = this._view.getFrameOffset();
    var width = this._view.getWidth();
    var height = this._view.getHeight();

    this._drawWaveform(
      context,
      this._view.getWaveformData(),
      frameOffset,
      this._segment ? this._view.timeToPixels(this._segment.startTime) : frameOffset,
      this._segment ? this._view.timeToPixels(this._segment.endTime)   : frameOffset + width,
      width,
      height
    );

    context.fillShape(this);
  };

  /**
   * Draws a waveform on a canvas context.
   *
   * @param {Konva.Context} context The canvas context to draw on.
   * @param {WaveformData} waveformData The waveform data to draw.
   * @param {Number} frameOffset The start position of the waveform shown
   *   in the view, in pixels.
   * @param {Number} startPixels The start position of the waveform to draw,
   *   in pixels.
   * @param {Number} endPixels The end position of the waveform to draw,
   *   in pixels.
   * @param {Number} width The width of the waveform area, in pixels.
   * @param {Number} height The height of the waveform area, in pixels.
   */

  WaveformShape.prototype._drawWaveform = function(context, waveformData,
    frameOffset, startPixels, endPixels, width, height) {
    if (startPixels < frameOffset) {
      startPixels = frameOffset;
    }

    var limit = frameOffset + width;

    if (endPixels > limit) {
      endPixels = limit;
    }

    if (endPixels > waveformData.adapter.length) {
      endPixels = waveformData.adapter.length;
    }

    var x, val;

    context.beginPath();

    for (x = startPixels; x < endPixels; x++) {
      val = waveformData.min_sample(x);

      context.lineTo(x - frameOffset + 0.5, scaleY(val, height, this._scale) + 0.5);
    }

    for (x = endPixels - 1; x >= startPixels; x--) {
      val = waveformData.max_sample(x);

      context.lineTo(x - frameOffset + 0.5, scaleY(val, height, this._scale) + 0.5);
    }

    context.closePath();
  };

  WaveformShape.prototype.setWaveformColor = function(color) {
    this.fill(color);
  };

  return WaveformShape;
});
