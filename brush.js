//let 𖹭 = Object.assign

class Point extends DOMPointReadOnly {
	distance(p) {
		return Math.hypot(this.x-p.x, this.y-p.y)
	}
	
	magnitude() {
		return Math.hypot(this.x, this.y)
	}
	divide(p) {
		return new Point(this.x/p.x, this.y/p.y)
	}
	add(p) {
		return new Point(this.x+p.x, this.y+p.y)
	}
	subtract(p) {
		return new Point(this.x-p.x, this.y-p.y)
	}
	floor() {
		return new Point(Math.floor(this.x), Math.floor(this.y))
	}
	round() {
		return new Point(Math.round(this.x), Math.round(this.y))
	}
	cursor_adjust(size) {
		let x = size.x%2 ? Math.floor(this.x)+0.5 : Math.floor(this.x+0.5)
		let y = size.y%2 ? Math.floor(this.y)+0.5 : Math.floor(this.y+0.5)
		return new Point(x, y)
	}
	signs() {
		return new Point(Math.sign(this.x), Math.sign(this.y))
	}
	max_distance(p) { //todo: what was this actually called?
		return Math.max(this.x-p.x, this.y-p.y)
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
		d.draw_line2(old, pos, new Point(3,3), pos=>{
			d.draw(pos)
		})
		//d.draw_line(old, pos)
		//console
	}
	end(d, pos) {
		d.draw(pos)
	}
}

//class Brush


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
		
		this.c2d = this.canvas.getContext('2d', {alpha: false})
		this.c2d.imageSmoothingEnabled = false
		this.c2d.globalCompositeOperation = 'copy'
		this.c2d.shadowOffsetX = 1000
		this.c2d.shadowOffsetY = 0
		
		this.history_max = 20
		this.history_reset()
		
		this.clear()
		
		this.set_tool(new Freehand())
		
		this.set_brush({
			origin: new Point(1, 1),
			fills: [
				[0, 0, 2, 2],
			],
		})//new Path2D('M-100,0 m-1-1 h2 v2 h-2 z'))
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
	
	// tools
	set_tool(tool) {
		this.tool = tool
	}
	
	// event handling
	canvas_scale() {
		let csizeP = Point.FromRect(this.canvas.getBoundingClientRect())
		let cdimP = Point.FromRect(this.canvas)
		return csizeP.divide(cdimP)
	}
	
	event_pos(ev) {
		let scaleP = this.canvas_scale()
		
		let ps = 1/window.devicePixelRatio/2
		let adjustP = new Point(ps, ps).divide(scaleP)
		
		return new Point(ev.offsetX, ev.offsetY).add(adjustP).divide(scaleP)
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
		this.c2d.fillStyle = 'white'
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
		let {x,y} = pos.subtract(origin).round()
		fills.forEach(([s,t,w,h])=>this.c2d.fillRect(x+s-1000,y+t,w,h))
	}
	draw_line(start, end) {
		let diffP = end.subtract(start)
		let dist = diffP.magnitude()
		let stepP = diffP.divide({x:dist, y:dist})
		for (let i=0; i<dist; i++) {
			this.draw(end)
			end = end.subtract(stepP)
		}
	}
	// todo: instead of csize we should use the cursor origin (whether it's at .0 or .5)
	draw_line2(start, end, csize, callback) {
		// distance
		let diff = end.subtract(start)
		// steps
		let sign = diff.signs()
		let hstep = new Point(sign.x, 0)
		let vstep = new Point(0, sign.y)
		//
		let pos = start.cursor_adjust(csize)
		let stop = end.cursor_adjust(csize)
		let i
		for (i=0;i<500;i++) {
			callback(pos)
			if (Math.abs(pos.x-end.x)<=0.5 && Math.abs(pos.y-end.y)<=0.5)
				break
			// move in the direction that takes us closest to the ideal line
			// ugh doing this as vector ops is just really gross.
			let cdiff = pos.subtract(start)
			let c = diff.x*cdiff.y - diff.y*cdiff.x
			let horiz = Math.abs(c-hstep.x*diff.y)
			let vert = Math.abs(c+vstep.y*diff.x)
			
			pos = pos.add(hstep.x && horiz<=vert ? hstep : vstep)
		}
		if (i>400)
			console.log('failed', start,end,pos,stop)
		//console.log(pos, stop)
		callback(stop)
	}
}
