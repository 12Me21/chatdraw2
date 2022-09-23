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
	static FromRect({width, height}) {
		return new this(width, height)
	}
}

class ChatDraw {
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
		this.c2d.translate(-1000, 0)
		
		this.history_max = 20
		this.history_reset()
		
		this.clear()
		
		this.set_brush({
			origin: new Point(1, 1),
			fills: [
				[0, 0, 2, 2],
			],
		})//new Path2D('M-100,0 m-1-1 h2 v2 h-2 z'))
		this.set_pattern('white')
		this.set_color('black')
		
		this.pointers = new Map()
		
		this.canvas.onpointerdown = ev=>{
			ev.target.setPointerCapture(ev.pointerId)
			let posP = this.event_pos(ev)
			this.pointers.set(ev.pointerId, posP)
			
			this.history_add()
			this.draw(posP)
		}
		
		this.canvas.onlostpointercapture = ev=>{
			this.pointers.delete(ev.pointerId)
		}
		
		this.canvas.onpointermove = ev=>{
			let oldP = this.pointers.get(ev.pointerId)
			if (!oldP)
				return
			let posP = this.event_pos(ev)
			this.pointers.set(ev.pointerId, posP)
			
			this.draw_line(oldP, posP)
		}
		
	}
	
	history_get() {
		return this.c2d.getImageData(0, 0, this.canvas.width, this.canvas.height)
	}
	history_set(data) {
		this.c2d.putImageData(data, 0, 0)
	}
	
	history_reset() {
		this.history = [[], []]
	}
	history_add() {
		let undo = this.history[0]
		undo.push(this.history_get())
		this.history[1] = []
		while (undo.length > this.history_max)
			undo.shift()
	}
	history_do(redo=false) {
		let data = this.history[redo?1:0].pop()
		if (data===undefined)
			return false
		this.history[redo?0:1].push(this.history_get())
		this.history_set(data)
		return true
	}
	
	clear() {
		this.history_add()
		this.c2d.save()
		this.c2d.resetTransform()
		this.c2d.fillStyle = 'white'
		this.c2d.shadowColor = null
		this.c2d.fillRect(0, 0, this.canvas.width, this.canvas.height)
		this.c2d.restore()
	}
	
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
	
	set_color(color) {
		this.c2d.shadowColor = this.color = color
	}
	
	set_pattern(pattern) {
		this.c2d.fillStyle = this.pattern = pattern
	}
	
	set_brush(brush) {
		this.brush = brush
	}
	
	draw(posP) {
		let {origin, fills} = this.brush
		let {x,y} = posP.subtract(origin).round()
		fills.forEach(([s,t,w,h])=>this.c2d.fillRect(x+s,y+t,w,h))
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
}
