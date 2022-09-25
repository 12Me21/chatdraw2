//let 𖹭 = Object.assign

function draw_button(arg) {
	for (let type in arg) {
		let input = document.createElement('input')
		Object.assign(input, {type, name:arg[type], value:arg.value})
		let span = document.createElement('span')
		span.append(arg.text)
		let label = document.createElement('label')
		label.append(input, span)
		return label
	}
}

class Point extends DOMPointReadOnly {
	distance(p) {
		return Math.hypot(this.x-p.x, this.y-p.y)
	}
	magnitude() {
		return Math.hypot(this.x, this.y)
	}
	max_distance(p) { //todo: what was this actually called?
		return Math.max(this.x-p.x, this.y-p.y)
	}
	axis_diff() {
		return Math.abs(this.x - this.y)
	}
	// not a real measurement, only useful for comparing points' distances from the same line
	ldist(start, end) {
		return end.Subtract(start).RMultiply(start.Subtract(this)).axis_diff()
	}
	
	Divide(p) {
		return new Point(this.x/p.x, this.y/p.y)
	}
	RMultiply(p) { // name?
		return new Point(this.x*p.y, this.y*p.x)
	}
	SwapAxes() {
		return new Point(this.y, this.x)
	}
	Add(p) {
		return new Point(this.x+p.x, this.y+p.y)
	}
	Subtract(p) {
		return new Point(this.x-p.x, this.y-p.y)
	}
	Multiply(p) {
		return new Point(this.x*p.x, this.y*p.y)
	}
	Lerp(p, t) {
		return new Point(this.x*(1-t)+p.x*t, this.y*(1-t)+p.y*t)
	}
	Floor() {
		return new Point(Math.floor(this.x), Math.floor(this.y))
	}
	Round() {
		return new Point(Math.round(this.x), Math.round(this.y))
	}
	Cursor_adjust(brush) {
		return this.Subtract(brush.origin).Round().Add(brush.origin)
	}
	Signs() {
		return new Point(Math.sign(this.x), Math.sign(this.y))
	}
	
	static FromRect({width, height}) {
		return new this(width, height)
	}
}

class Tool {
}

class Freehand extends Tool {
	start(d, pos) {
		d.draw(pos)
	}
	drag(d, pos, old) {
		d.draw_line(old, pos)
	}
	end(d, pos) {
		d.draw(pos)
	}
}

class Slow extends Tool {
	constructor() {
		super()
		this.speed = 0.15
		this.avg = new Point()
	}
	start(d, pos) {
		this.avg = pos
	}
	drag(d, pos, old) {
		pos = this.avg.Lerp(pos, this.speed)
		d.draw_line(this.avg, pos)
		this.avg = pos
	}
	end(d, pos) {
		this.drag(d, pos, pos)
	}
}


class Brush {
	constructor(origin, fills) {
		this.origin = origin
		this.fills = fills
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
		this.set_composite('source-over')
		this.c2d.shadowOffsetX = 1000
		this.c2d.shadowOffsetY = 0
		
		this.history_max = 20
		this.history_reset()
		
		this.clear()
		
		this.set_tool(new Freehand())
		
		this.set_brush(new Brush(new Point(1, 1), [
			[0, 0, 2, 2],
		]))//new Path2D('M-100,0 m-1-1 h2 v2 h-2 z'))
		this.set_pattern('white')
		this.set_color('black')
		
		// stroke handling:
		this.pointers = new Map()
		this.canvas.onpointerdown = ev=>{
			ev.target.setPointerCapture(ev.pointerId)
			let pos = this.event_pos(ev)
			this.pointers.set(ev.pointerId, pos)
			
			this.history_add()
			this.tool.start(this, pos)
		}
		this.canvas.onlostpointercapture = ev=>{
			this.pointers.delete(ev.pointerId)
		}
		this.canvas.onpointermove = ev=>{
			let old = this.pointers.get(ev.pointerId)
			if (!old)
				return
			let pos = this.event_pos(ev)
			this.pointers.set(ev.pointerId, pos)
			
			this.tool.drag(this, pos, old)
		}
		
	}
	
	//'source-over' - replace
	//'destination-over' - draw behind
	//'source-atop' - draw on existing colors
	set_composite(mode) {
		this.c2d.globalCompositeOperation = mode
	}
	
	// tools
	set_tool(tool) {
		this.tool = tool
	}
	
	// event handling
	canvas_scale() {
		let csizeP = Point.FromRect(this.canvas.getBoundingClientRect())
		let cdimP = Point.FromRect(this.canvas)
		return csizeP.Divide(cdimP)
	}
	
	event_pos(ev) {
		let scaleP = this.canvas_scale()
		
		let ps = 1/window.devicePixelRatio/2
		let adjustP = new Point(ps, ps).Divide(scaleP)
		
		return new Point(ev.offsetX, ev.offsetY).Add(adjustP).Divide(scaleP)
	}
	
	// undo/redo
	history_get() {
		return this.c2d.getImageData(0, 0, this.canvas.width, this.canvas.height)
	}
	history_set(data) {
		this.c2d.putImageData(data, 0, 0)
	}
	history_reset() {
		this.history = [[], []]
		this.history_onchange()
	}
	history_add() {
		let undo = this.history[0]
		undo.push(this.history_get())
		this.history[1] = []
		while (undo.length > this.history_max)
			undo.shift()
		this.history_onchange()
	}
	history_do(redo=false) {
		let data = this.history[redo?1:0].pop()
		if (data===undefined)
			return false
		this.history[redo?0:1].push(this.history_get())
		this.history_set(data)
		this.history_onchange()
		return true
	}
	history_onchange() {
	}
	
	// drawing
	clear() {
		this.history_add()
		this.c2d.save()
		this.c2d.resetTransform()
		this.c2d.globalCompositeOperation = 'copy'
		this.c2d.fillStyle = 'transparent'
		this.c2d.shadowColor = 'transparent'
		this.c2d.fillRect(0, 0, this.canvas.width, this.canvas.height)
		this.c2d.restore()
	}
	set_color(color) {
		this.c2d.shadowColor = this.color = color
	}
	set_pattern(pattern) {
		this.c2d.fillStyle = this.pattern = pattern
	}
	set_brush(brush) {
		this.brush = brush
	}
	draw(pos) {
		let {origin, fills} = this.brush
		let {x,y} = pos.Subtract(origin).Round()
		fills.forEach(([s,t,w,h])=>this.c2d.fillRect(x+s-1000,y+t,w,h))
	}
	draw_line(start, end, callback=pos=>this.draw(pos)) {
		// steps
		let step_h = new Point(Math.sign(end.x-start.x), 0)
		let step_v = new Point(0, Math.sign(end.y-start.y))
		//
		let pos = start.Cursor_adjust(this.brush)
		let stop = end.Cursor_adjust(this.brush)
		let i
		for (i=0; i<500; i++) {
			callback(pos)
			
			let rem = pos.Subtract(end)
			if (Math.abs(rem.x)<=0.5 && Math.abs(rem.y)<=0.5)
				break
			
			// move in the direction that takes us closest to the ideal line
			let horiz = pos.Add(step_h)
			let vert = pos.Add(step_v)
			
			if (step_h.x && horiz.ldist(start, end)<=vert.ldist(start, end))
				pos = horiz
			else
				pos = vert
		}
		if (i>400)
			console.log('failed', start,end,pos,stop)
		//console.log(pos, stop)
		callback(stop)
	}
}
