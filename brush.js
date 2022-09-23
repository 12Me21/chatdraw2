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
		this.c2d.globalCompositeOperation = 'copy'
		this.clear()
		
		this.set_brush(new Path2D('M-100,0 m-1-1 h2 v2 h-2 z'))
		this.set_pattern('white')
		this.set_color('black')
		
		this.pointers = new Map()
		
		this.canvas.onpointerdown = ev=>{
			ev.target.setPointerCapture(ev.pointerId)
			let posP = this.event_pos(ev)
			this.pointers.set(ev.pointerId, posP)
			
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
			
			let diffP = posP.subtract(oldP)
			let dist = diffP.magnitude()
			let stepP = diffP.divide({x:dist, y:dist})
			for (let i=0; i<dist; i++) {
				this.draw(posP)
				posP = posP.subtract(stepP)
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
	
	draw(pos) {
		pos = pos.floor().add({x:100,y:0})
//		console.log(pos, this.color, this.pattern, this.brush)
		this.c2d.shadowOffsetX = pos.x
		this.c2d.shadowOffsetY = pos.y
		if (this.pattern.setTransform)
			this.pattern.setTransform(new DOMMatrixReadOnly([1,0,0,1,-pos.x,-pos.y]))
		//this.c2d.fillRect(-100, 0, 10, 10)
		this.c2d.fill(this.brush)
	}
	
}
