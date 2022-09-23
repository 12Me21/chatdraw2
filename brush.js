//let 𖹭 = Object.assign

class ChatDraw {
	constructor(width, height) {
		this.canvas = document.createElement('canvas')
		this.canvas.width = width
		this.canvas.height = height
		
		this.c2d = this.canvas.getContext('2d', {alpha: false})
		this.c2d.imageSmoothingEnabled = false
		this.c2d.globalCompositeOperation = 'copy'
		this.c2d.globalAlpha = false
		
		this.brush = null
		this.pattern = null
		this.color = null
	}
	
	set_color(color) {
		this.shadowColor = this.color = color
	}
	
	set_pattern(pattern) {
		this.pattern = pattern
	}
	
	set_brush(brush) {
		this.brush = brush
	}
	
	draw(x, y) {
		x = Math.floor(x) + 100
		y = Math.floor(y)
		this.c2d.shadowOffsetX = x
		this.c2d.shadowOffsetY = y
		if (this.pattern.setTransform)
			this.pattern.setTransform(new DOMMatrixReadOnly([1,0,0,1,-x,-y]))
		this.c2d.fill(this.brush)
	}
	
}
