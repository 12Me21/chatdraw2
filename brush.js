"use strict"

class RadioSelector {
	constructor() {
		
	}
	add() {
		
	}
}

class Point extends DOMPointReadOnly {
	c_dist(p) { return Math.max(Math.abs(this.x-p.x), Math.abs(this.y-p.y)) }
	toString() { return `(${this.x}, ${this.y})` }
	
	Divide(p) { return new Point(this.x/p.x, this.y/p.y) }
	Add(p) { return new Point(this.x+p.x, this.y+p.y) }
	Subtract(p) { return new Point(this.x-p.x, this.y-p.y) }
	Multiply(p) { return new Point(this.x*p.x, this.y*p.y) }
	Lerp(p, t) { return new Point(this.x*(1-t)+p.x*t, this.y*(1-t)+p.y*t) }
	Floor() { return new Point(Math.floor(this.x), Math.floor(this.y)) }
	Round() { return new Point(Math.round(this.x), Math.round(this.y)) }
	
	static FromRect({width, height}) { return new this(width, height) }
	
	* follow_line(start, end) {
		let diff = end.Subtract(start)
		let step_h = new Point(Math.sign(diff.x), 0)
		let step_v = new Point(0, Math.sign(diff.y))
		for (let pos=this,step=step_v; pos.c_dist(end)>0.5; pos=pos.Add(step)) {
			yield pos
			// choose step that takes us closest to the ideal line
			if (step_h.x) {
				let c = diff.x*(pos.y-start.y) - diff.y*(pos.x-start.x)
				let horz = Math.abs(c - step_h.x*diff.y)
				let vert = Math.abs(c + step_v.y*diff.x)
				step = horz<=vert ? step_h : step_v
			}
		}
		yield end
	}
}

class Tool {
	down(){}
	move(){}
	up(){}
}

class Freehand extends Tool {
	down(d, pos) {
		d.draw(pos)
	}
	move(d, pos, old) {
		d.draw_line(old, pos)
	}
}

class Spray extends Tool {
	down(d, pos) {
		this.move(d, pos)
	}
	move(d, pos, old) {
		for (let i=0;i<10;i++)
			d.random_in_brush(pos)
	}
}

class LineTool extends Tool {
	constructor() {
		super()
		this.old = new Point()
	}
	down(d, pos) {
		this.old = pos
	}
	up(d, pos) {
		d.draw_line(this.old, pos)
	}
}

class Slow extends Tool {
	constructor() {
		super()
		this.speed = 0.15
		this.avg = new Point()
	}
	down(d, pos) {
		this.avg = pos
	}
	move(d, pos) {
		pos = this.avg.Lerp(pos, this.speed)
		d.draw_line(this.avg, pos)
		this.avg = pos
	}
	up(d, pos) {
		this.move(d, pos)
	}
}


class Brush extends Path2D {
	constructor(origin, fills) {
		super()
		for (let f of fills)
			super.rect(...f)
		this.origin = origin
	}
	add_to(path, pos) {
		let {x,y} = pos.Subtract(this.origin).Round()
		path.addPath(this, new DOMMatrixReadOnly([1,0,0,1,x,y]))
	}
	adjust_cursor(pos) {
		return pos.Subtract(this.origin).Round().Add(this.origin)
	}
	point(pos) {
		let path = new Path2D()
		this.add_to(path, pos)
		return path
	}
	line(start, end) {
		let path = new Path2D()
		let i=0
		for (let pos of this.adjust_cursor(start).follow_line(start, end)) {
			if (i++>400)
				throw new Error(`Infinite loop when drawing line:\nfrom ${start} to ${end}.`)
			this.add_to(path, pos)
		}
		return path
	}
}

class CircleBrush extends Brush {
	constructor(d) {
		let r = d/2, sr = r-0.5
		let fills = []
		for (let y=-sr; y<=sr; y++) {
			let x = Math.ceil(Math.sqrt(r*r - y*y)+sr)
			fills.push([x, y+sr, (r-x)*2, 1])
		}
		super(new Point(r, r), fills)
	}
}


// todo: want a setting that allows drawing "behind" existing colors

class Drawer {
	constructor(width, height) {
		this.canvas = document.createElement('canvas')
		this.canvas.width = width
		this.canvas.height = height
		this.canvas.style.setProperty('--width', width)
		this.canvas.style.setProperty('--height', height)
		this.canvas.style.imageRendering = '-moz-crisp-edges'
		this.canvas.style.imageRendering = 'pixelated'
		this.canvas.style.touchAction = 'none'
		
		this.c2d = this.canvas.getContext('2d')
		this.c2d.imageSmoothingEnabled = false
		this.c2d.shadowOffsetX = 1000
		this.c2d.translate(-1000, 0)
		
		this.history_max = 20
		this.history_reset()
		
		this.set_composite('source-over')
		// todo: dont uh, make new tools here..
		// also tbh these could be setters..
		this.set_tool(new Freehand())
		this.set_brush(new Brush(new Point(1, 1), [ [0, 0, 2, 2] ]))
		this.set_pattern('white')
		this.set_color('black')
		
		this.clear(true)
		
		// stroke handling:
		this.pointers = new Map()
		this.canvas.onpointerdown = ev=>{
			ev.target.setPointerCapture(ev.pointerId)
			this.history_add()
			this.pointers.set(ev.pointerId, {old: null})
			this.do_tool(ev)
		}
		this.canvas.onpointermove = this.canvas.onpointerup = ev=>{
			this.do_tool(ev)
		}
		this.canvas.onlostpointercapture = ev=>{
			this.pointers.delete(ev.pointerId)
		}
	}
	
	//////////////////////
	/// event handling ///
	//////////////////////
	do_tool(ev) {
		let ptr = this.pointers.get(ev.pointerId)
		if (!ptr)
			return
		let pos = this.event_pos(ev)
		let old = ptr.old
		ptr.old = pos
		this.tool[ev.type.slice(7)](this, pos, old)
	}
	event_pos(ev) {
		let scale = Point.FromRect(this.canvas.getBoundingClientRect()).Divide(Point.FromRect(this.canvas))
		
		let ps = 1/window.devicePixelRatio/2
		let adjust = new Point(ps, ps).Divide(scale)
		
		return new Point(ev.offsetX, ev.offsetY).Add(adjust).Divide(scale)
	}
	/////////////////
	/// undo/redo ///
	/////////////////
	
	// TODO: save/restore the palette!!
	history_get() {
		return this.get_data()
	}
	history_put(data) {
		this.put_data(data)
	}
	// clear
	history_reset() {
		this.history = {false:[], true:[]}
		this.history_onchange()
	}
	// push state
	history_add() {
		let undo = this.history.false
		undo.push(this.history_get())
		this.history.true = []
		while (undo.length > this.history_max)
			undo.shift()
		this.history_onchange()
	}
	// undo/redo
	history_do(redo=false) {
		let data = this.history[redo].pop()
		if (data===undefined)
			return false
		this.history[!redo].push(this.history_get())
		this.history_put(data)
		this.history_onchange()
		return true
	}
	// callback, assign to this
	history_onchange() {}
	/////////////////////
	/// setting state ///
	/////////////////////
	set_color(color) { this.c2d.shadowColor = color }
	set_pattern(pattern) { this.c2d.fillStyle = pattern }
	set_brush(brush) { this.brush = brush}
	set_composite(mode) { this.c2d.globalCompositeOperation = mode }
	set_tool(tool) { this.tool = tool }
	///////////////
	/// drawing ///
	///////////////
	get_data() {
		return this.c2d.getImageData(0, 0, this.canvas.width, this.canvas.height)
	}
	put_data(data) {
		this.c2d.putImageData(data, 0, 0)
	}
	clear(all) {
		this.history_add()
		if (all) {
			this.c2d.save()
			this.c2d.globalCompositeOperation = 'destination-out'
			this.c2d.fillStyle = 'black'
		}
		this.c2d.fillRect(0, 0, this.canvas.width, this.canvas.height)
		if (all)
			this.c2d.restore()
	}
	draw(pos) {
		this.c2d.fill(this.brush.point(pos))
	}
	draw_line(start, end) {
		this.c2d.fill(this.brush.line(start, end))
	}
	// bad
	random_in_brush(pos) {
		let r
		let n = 0
		do {
			n++
			if (n>30)
				return
			r = new Point(Math.random()*10-5, Math.random()*10-5)
			r = this.brush.adjust_cursor(r).Add(this.brush.origin)
		} while (!this.c2d.isPointInPath(this.brush, r.x+.5-1000, r.y+.5))
		pos = pos.Add(r).Subtract(this.brush.origin)
		this.c2d.fillRect(pos.x, pos.y, 1, 1)
	}
	// convert a hex color into a Uint32, in system endianness
	color32(color=null) {
		if (!color)
			return 0
		let x = parseInt(color.slice(1), 16)
		return new Uint32Array(Uint8Array.of(x>>16, x>>8, x, 255).buffer)[0]
	}
	replace_color(before, after=null) {
		this.history_add()
		before = this.color32(before)
		after = this.color32(after)
		let data = this.get_data()
		new Uint32Array(data.data.buffer).forEach((n,i,d)=>{
			if (n==before)
				d[i] = after
		})
		this.put_data(data)
	}
	
	dither_pattern(level) {
		const od = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
		let canvas = document.createElement('canvas')
		canvas.width = 4
		canvas.height = 4
		let c2d = canvas.getContext('2d')
		let data = c2d.createImageData(4, 4)
		for (let x=0; x<16; x++)
			if (od[x] <= level)
				data.data[x<<2|3] = 0xFF
		// hack: we want a larger canvas to use as a button label
		c2d.putImageData(data, 0, 0)
		let pattern = this.c2d.createPattern(canvas, 'repeat')
		canvas.width = 8
		canvas.height = 5
		for (let y=0;y<5;y+=4)
			for (let x=-3;x<8;x+=4)
				c2d.putImageData(data, x, y)
		return [pattern, canvas]
	}
}
