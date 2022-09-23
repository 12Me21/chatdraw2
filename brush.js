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
	static FromRect({width, height}) {
		return new this(width, height)
	}
}

class ChatDraw {
	constructor(width, height) {
		this.canvas = document.createElement('canvas')
		this.canvas.width = width
		this.canvas.height = height
		this.canvas.style.imageRendering = '-moz-crisp-edges'
		this.canvas.style.imageRendering = 'pixelated'
		this.canvas.style.touchAction = 'none'
		
		this.c2d = this.canvas.getContext('2d', {alpha: false})
		this.c2d.imageSmoothingEnabled = false
//		this.c2d.globalCompositeOperation = 'copy'
//		this.c2d.globalAlpha = false
		this.clear()
		
		this.brush = null
		this.pattern = null
		this.color = null
		
		this.pointers = new Map()
		
		this.canvas.onpointerdown = ev=>{
			ev.target.setPointerCapture(ev.pointerId)
			let pos = this.event_pos(ev)
			this.pointers.set(ev.pointerId, pos)
			
			this.draw(pos)
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
			
			let diff = pos.subtract(old)
			let dist = diff.magnitude()
			let step = diff.divide({x:dist, y:dist})
			for (let i=0; i<dist; i++) {
				this.draw(pos)
				pos = pos.subtract(step)
			}
		}
		
	}
	
	clear() {
		this.c2d.save()
		this.c2d.fillStyle = 'white'
		this.c2d.fillRect(0, 0, this.canvas.width, this.canvas.height)
		this.c2d.restore()
	}
	
	canvas_scale() {
		let csize = Point.FromRect(this.canvas.getBoundingClientRect())
		let cdim = Point.FromRect(this.canvas)
		return csize.divide(cdim)
	}
	
	event_pos(ev) {
		let scale = this.canvas_scale()
		
		let ps = 1/window.devicePixelRatio/2
		let adjust = new Point(ps, ps).divide(scale)
		
		return new Point(ev.offsetX, ev.offsetY).add(adjust).divide(scale)
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
		pos = pos.floor().add({x:100,y:0})
//		console.log(pos, this.color, this.pattern, this.brush)
		this.c2d.shadowOffsetX = pos.x
		this.c2d.shadowOffsetY = pos.y
		if (this.pattern.setTransform)
			this.pattern.setTransform(new DOMMatrixReadOnly([1,0,0,1,-pos.x,-pos.y]))
		this.c2d.fill(this.brush)
	}
	
}
