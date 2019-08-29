/**
 * @file
 *
 * Common functions used in multiple modules are collected here for DRY purposes.
 *
 * @module peaks/waveform/waveform.mixins
 */

define(['konva'], function(Konva) {
  'use strict';

  function createSegmentRectangle(options) {
    var rectHeight = options.height;

    var segmentRect = new Konva.Rect({
      x:      0,
      y:      0,
      width:  0,
      height: rectHeight,
      fill:   '#fff',
      opacity: 0.5
      // TODO: globalCompositeOperation
      // globalCompositeOperation: 'color-dodge'
    });

    segmentRect.on('mouseenter', function(event) {
      segmentRect.fill('#d9fcf7');
      // segmentRect.opacity(1);
      options.layer.draw();
      options.onMouseEnter(options.segment);
    });

    segmentRect.on('mouseleave', function(event) {
      // TODO: only do this when we're sure, the rect is
      // being rendered, or else it will crash the app
      segmentRect.fill('#fff');
      segmentRect.opacity(0.5);
      options.layer.draw();
      options.onMouseLeave(options.segment);
    });

    return segmentRect;
  }

  /**
   * Parameters for the {@link createSegmentMarker} function.
   *
   * @typedef {Object} CreateSegmentMarkerOptions
   * @global
   * @property {Boolean} draggable If true, marker is draggable.
   * @property {Number} height Height of handle group container (canvas).
   * @property {String} color Colour hex value for handle and line marker.
   * @property {Boolean} inMarker Is this marker the inMarker (LHS) or outMarker (RHS).
   * @property {Konva.Group} segmentGroup
   * @property {Object} segment
   * @property {Konva.Layer} layer
   * @property {Function} onDrag Callback after drag completed.
   */

  /**
   * Creates a Left or Right side segment handle group in Konva based on the
   * given options.
   *
   * @param {CreateSegmentMarkerOptions} options
   * @returns {Konva.Group} Konva group object of handle marker element.
   */

  function createSegmentMarker(options) {
    var handleHeight = options.height;
    var handleWidth  = 3;
    var handleY      = 0;
    var handleX      = options.inMarker ? 0 : handleWidth * -1;

    var group = new Konva.Group({
      draggable: options.draggable,
      dragBoundFunc: function(pos) {
        var limit;

        // implement own limits
        if (options.inMarker) {
          limit = options.segmentGroup.outMarker.getX() - options.segmentGroup.outMarker.getWidth();

          if (pos.x > limit) {
            pos.x = limit;
          }
        }
        else {
          limit = options.segmentGroup.inMarker.getX() + options.segmentGroup.inMarker.getWidth();

          if (pos.x < limit) {
            pos.x = limit;
          }
        }

        return {
          x: pos.x,
          y: this.getAbsolutePosition().y
        };
      }
    });

    var xPosition = options.inMarker ? -12 : 12;

    var text = new Konva.Text({
      x:          xPosition,
      y:          (options.height / 2) - 5,
      text:       '',
      fontSize:   13,
      fontFamily: 'sans-serif',
      fill:       '#000',
      textAlign:  'center'
    });

    text.hide();
    group.label = text;

    var handle = new Konva.Rect({
      x:           handleX,
      y:           handleY,
      width:       handleWidth,
      height:      handleHeight,
      fill:        options.color,
      draggable:   options.draggable,
      dragBoundFunc: function(pos) {
        // TODO: implement own limits
        var limitMin;
        var limitMax;

        // implement own limits
        if (options.inMarker) {
          limitMin =
            options.segmentGroup.outMarker.getX() - options.segmentGroup.outMarker.getWidth();
          limitMax = handle.leftNeighbourX;
          // TODO: Use Utils.clamp(val, min, max)
          pos.x = Math.max(limitMax, Math.min(limitMin, pos.x));
        }
        else {
          limitMin =
            options.segmentGroup.inMarker.getX() + options.segmentGroup.inMarker.getWidth();
          limitMax = handle.rightNeighbourX;
          // TODO: Use Utils.clamp(val, min, max)
          pos.x = Math.max(limitMin, Math.min(limitMax, pos.x));
        }

        return {
          x: pos.x,
          y: this.getAbsolutePosition().y
        };
      }
    });

    // Events

    if (options.draggable && options.onDrag) {
      handle.on('dragmove', function(event) {
        options.onDrag(options.segmentGroup, options.segment, options.inMarker);
      });
      handle.on('dragstart', function(event) {
        var neighbourSegments = options.findSegmentNeighbours(options.segment);
        var neighbour;

        if (options.inMarker) {
          neighbour = neighbourSegments.left ? neighbourSegments.left.outMarker : undefined;
          handle.leftNeighbourX = neighbour ? neighbour.getX() + neighbour.getWidth() : 0;
        }
        else {
          neighbour = neighbourSegments.right ? neighbourSegments.right.inMarker : undefined;
          handle.rightNeighbourX =
            neighbour ? neighbour.getX() - neighbour.getWidth() : options.viewWidth;
        }
        options.layer.draw();
      });
      handle.on('dragend', function(event) {
        options.layer.draw();
      });
    }

    handle.on('mouseover touchstart', function(event) {
      // change fill color, change cursor to we-resize
      options.layer.draw();
      options.onMouseEnter(options.segment);
    });

    handle.on('mouseout touchend', function(event) {
      options.layer.draw();
      options.onMouseLeave(options.segment);
    });

    group.add(text);
    group.add(handle);

    // return group;
    return handle;
  }

  /**
   * Creates a Konva.Text object that renders a segment's label text.
   *
   * @param {Konva.Group} segmentGroup
   * @param {Segment} segment
   * @returns {Konva.Text}
   */

  function createSegmentLabel(segmentGroup, segment) {
    return new Konva.Text({
      x:          12,
      y:          12,
      text:       segment.labelText,
      textAlign:  'center',
      fontSize:   12,
      fontFamily: 'Arial, sans-serif',
      fill:       '#000'
    });
  }

  /**
   * Parameters for the {@link createPointMarker} function.
   *
   * @typedef {Object} CreatePointMarkerOptions
   * @global
   * @property {Boolean} draggable If true, marker is draggable.
   * @property {Boolean} showLabel If true, show the label text next to the marker.
   * @property {String} handleColor Color hex value for handle and line marker.
   * @property {Number} height Height of handle group container (canvas).
   * @property {Konva.Group} pointGroup  Point marker UI object.
   * @property {Object} point Point object with timestamp.
   * @property {Konva.Layer} layer Layer that contains the pointGroup.
   * @property {Function} onDblClick
   * @property {Function} onDragStart
   * @property {Function} onDragMove Callback during mouse drag operations.
   * @property {Function} onDragEnd
   * @property {Function} onMouseEnter
   * @property {Function} onMouseLeave
   */

  /**
   * Creates a point handle group in Konva based on the given options.
   *
   * @param {CreatePointMarkerOptions} options
   * @returns {Konva.Group} Konva group object of handle marker elements
   */

  function createPointMarker(options) {
    var handleTop = (options.height / 2) - 10.5;
    var handleWidth = 10;
    var handleHeight = 20;
    var handleX = -(handleWidth / 2) + 0.5; // Place in the middle of the marker

    var group = new Konva.Group({
      draggable: options.draggable,
      dragBoundFunc: function(pos) {
        return {
          x: pos.x, // No constraint horizontally
          y: this.getAbsolutePosition().y // Constrained vertical line
        };
      }
    });

    if (options.onDragStart) {
      group.on('dragstart', function(event) {
        options.onDragStart(options.point);
      });
    }

    if (options.onDragMove) {
      group.on('dragmove', function(event) {
        options.onDragMove(options.point);
      });
    }

    if (options.onDragEnd) {
      group.on('dragend', function(event) {
        options.onDragEnd(options.point);
      });
    }

    if (options.onDblClick) {
      group.on('dblclick', function(event) {
        options.onDblClick(options.point);
      });
    }

    if (options.onMouseEnter) {
      group.on('mouseenter', function(event) {
        options.onMouseEnter(options.point);
      });
    }

    if (options.onMouseLeave) {
      group.on('mouseleave', function(event) {
        options.onMouseLeave(options.point);
      });
    }

    // Label
    var text = null;

    if (options.showLabel) {
      text = new Konva.Text({
        x:          2,
        y:          12,
        text:       options.point.labelText,
        textAlign:  'left',
        fontSize:   10,
        fontFamily: 'sans-serif',
        fill:       '#000'
      });

      group.label = text;
    }

    // Handle
    var handle = null;

    if (options.draggable) {
      handle = new Konva.Rect({
        x:      handleX,
        y:      handleTop,
        width:  handleWidth,
        height: handleHeight,
        fill:   options.handleColor
      });
    }

    // Line
    var line = new Konva.Line({
      x:           0,
      y:           0,
      points:      [0, 0, 0, options.height],
      stroke:      options.handleColor,
      strokeWidth: 1
    });

    // Events
    var time = null;

    if (handle) {
      // Time
      time = new Konva.Text({
        x:          -24,
        y:          (options.height / 2) - 5,
        text:       '',
        fontSize:   10,
        fontFamily: 'sans-serif',
        fill:       '#000',
        textAlign:  'center'
      });

      time.hide();
      group.time = time;

      handle.on('mouseover touchstart', function(event) {
        // Position text to the left of the marker
        time.setX(-24 - time.getWidth());
        time.show();
        options.layer.draw();
      });

      handle.on('mouseout touchend', function(event) {
        time.hide();
        options.layer.draw();
      });

      group.on('dragstart', function(event) {
        time.setX(-24 - time.getWidth());
        time.show();
        options.layer.draw();
      });

      group.on('dragend', function(event) {
        time.hide();
        options.layer.draw();
      });
    }

    if (handle) {
      group.add(handle);
    }

    group.add(line);

    if (text) {
      group.add(text);
    }

    if (time) {
      group.add(time);
    }

    return group;
  }

  // Public API

  return {
    createSegmentRectangle: createSegmentRectangle,
    createSegmentMarker: createSegmentMarker,
    createPointMarker: createPointMarker,
    createSegmentLabel: createSegmentLabel
  };
});
