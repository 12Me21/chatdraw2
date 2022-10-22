"use strict"

// todo: instead of the extra color, what if we just 
// have a checkbox that controls whether clipboard/dither are colorized..
// ughh

// all color strings should be in canonical format:
// lowercase #rrggbb, or rgba(r, g, b, 0.a) for transparent colors

// constant for the serialization of css color 'transparent'
// https://html.spec.whatwg.org/multipage/canvas.html#serialisation-of-a-color
//const COLORIZE = "rgba(0, 0, 0, 0)"

/* todo: prevent assigning duplicate palette colors (incl background) */

// todo: allow strokes to start in the border around the canvas too

class Point extends DOMPointReadOnly {
	[Symbol.toPrimitive](type) {
		if (type=='string')
			return `(${this.x}, ${this.y})`
		return this
	}
	
	static FromRect({width, height}) { return new this(width, height) }
	
	Add(p) {
		return new Point(this.x+p.x, this.y+p.y)
	}
	Subtract(p) {
		return new Point(this.x-p.x, this.y-p.y)
	}
	Divide(p) {
		return new Point(this.x/p.x, this.y/p.y)
	}
	Round() {
		return new Point(Math.round(this.x), Math.round(this.y))
	}	
	Floor() {
		return new Point(Math.floor(this.x), Math.floor(this.y))
	}	
	Ceil() {
		return new Point(Math.ceil(this.x), Math.ceil(this.y))
	}	
	Lerp(p, t) {
		return new Point(this.x*(1-t)+p.x*t, this.y*(1-t)+p.y*t)
	}
	
	c_dist(p) { return Math.max(Math.abs(this.x-p.x), Math.abs(this.y-p.y)) }
	// area of a triangle with vertexes at (0,0), `this`, and `p2`
	tri_area(p2) {
		return Math.abs(p2.x*this.y - p2.y*this.x)/2
	}
	cardinals(diag) {
		const sx = Math.sign(this.x), sy = Math.sign(this.y)
		let dx = 0, dy = 0
		if (diag) {
			if (Math.abs(this.x) >= Math.abs(this.y))
				dx = sx
			else
				dy = sy
		}
		return [new Point(sx, dy), new Point(dx, sy)]
	}
	
	* follow_line(start, end, diag) {
		if (this.c_dist(end)<=0.5)
			return yield end
		// decide on step sizes
		const diff = end.Subtract(start)
		const [step_h, step_v] = diff.cardinals(diag)
		// loop
		let i = 999
		for (let pos=this,step=step_v; pos.c_dist(end)>0.5; pos=pos.Add(step)) {
			if (--i < 0) {
				alert(`infinite loop drawing line: from ${start} to ${end} (diag: ${diag})`)
				throw new Error(`infinite loop drawing line: from ${start} to ${end} (diag: ${diag})`)
			}
			yield pos
			// choose step that takes us closest to the ideal line
			if (step_h.x || step_h.y) {
				const c = pos.Subtract(start)
				const horz = c.Add(step_h).tri_area(diff)
				const vert = c.Add(step_v).tri_area(diff)
				step = horz<=vert ? step_h : step_v
			}
		}
		yield end
	}
	/*
ideas here:
- will the 2 points always be on opposite sides of the goal line?
- is midpoint above/below line?
- what if we draw a line [such that reflecting point 1 over it results in point 2] what properties does this line have? intersect with goal line?
*/
}

class Stroke {
	static PointerDown(ev, canvas, ...context) {
		const st = new this(ev, context, canvas)
		Stroke.pointers.set(ev.pointerId, st)
		st.down?.(...st.context)
		return st
	}
	static handle(target, down) {
		target.onpointerdown = down
		target.onpointermove = target.onpointerup = ev=>{
			const st = this.pointers.get(ev.pointerId)
			if (!st) return
			st.update(ev)
			/// TODO: are we /sure/ that pointerup will be the last event?
			ev.type=='pointerup' && st.up?.(...st.context)
			st.use_overlay && st.context[1].erase()
			ev.type=='pointermove' && st.move?.(...st.context)
		}
		target.onlostpointercapture = ev=>{
			this.pointers.delete(ev.pointerId)
		}
	}
	
	constructor(ev, context, canvas) {
		ev.target.setPointerCapture(ev.pointerId)
		ev.preventDefault()
		this.pos = null
		this.canvas = canvas
		this.update(ev)
		this.start = this.pos
		this.context = context
		this.use_overlay = false
	}
	update({clientX, clientY}) {
		this.old = this.pos
		let rect = this.canvas.getBoundingClientRect()
		const scale = Point.FromRect(rect).Divide(Point.FromRect(this.canvas))
		const ps = 1/window.devicePixelRatio/2
		const adjust = new Point(ps, ps).Divide(scale)
		this.pos = new Point(clientX, clientY).Subtract(rect).Add(adjust).Divide(scale)
	}
	// TODO: we need to "lock" the overlay, because 2 strokes can be drawn at the same time with a touchscreen
	// or somehow support this properly?
	// could use like, xor mode perhaps..
	overlay() {
		const [grp, overlay] = this.context
		overlay.copy_settings(grp)
		this.use_overlay = true
	}
}
Stroke.pointers = new Map()

//// Tools ////
const tools = {
	Pen: class extends Stroke {
		down(d) {
			this._old = this.pos
			d.draw(this.pos)
		}
		move(d) {
			this._old = d.draw_line(this._old, this.pos)
		}
		static get label() { return ["✏️", "pen", true] }
	},
	// idea: spray that uses dither somehow? like, fills in based on ordered dithering? perhaps it umm.. like first fill in every pixel that lines up with pixel 0 in the pattern, then do pixel 1, etc..
	Spray: class extends Stroke {
		down(d) {
			this.move(d)
		}
		move(d) {
			for (let i=0;i<50;i++)
				d.random_in_brush(this.pos)
		}
		static get label() { return ["🚿️", "spray", true] }
	},
	Line: class extends Stroke {
		down(d, v) {
			this.overlay()
		}
		move(d, v) {
			v.draw_line(this.start, this.pos)
		}
		up(d, v) {
			d.draw_line(this.start, this.pos)
		}
		static get label() { return ["📏️", "line", true] }
	},
	Place: class extends Stroke {
		down(d, v) {
			this.overlay()
			v.draw(this.pos)
		}
		move(d, v) {
			v.draw(this.pos)
		}
		up(d, v) {
			d.draw(this.pos)
		}
		static get label() { return ["🥢️", "place", true] }  // 🎯?
	},
	Slow: class extends Stroke {
		down(d) {
			this._avg = this.pos
		}
		move(d) {
			const pos = this._avg.Lerp(this.pos, 0.15)
			d.draw_line(this._avg, pos)
			this._avg = pos
		}
		up(d) {
			this.move(d)
		}
		static get label() { return ["🖌️", "slow", true] }
	},
	Flood: class extends Stroke {
		down(d) {
			d.flood_fill(this.pos)
		}
		static get label() { return ["🌊️", "flood", true] }
	},
	Move: class extends Stroke {
		down(d) {
			this._data = d.get_data()
		}
		move(d) {
			const ofs = this.pos.Subtract(this.start).Round() // todo: round better
			const {width, height} = d.canvas
			let {x, y} = ofs
			x = (x+width*100) % width
			y = (y+height*100) % height
			d.put_data(this._data, x, y)
			d.put_data(this._data, x-width, y)
			d.put_data(this._data, x, y-height)
			d.put_data(this._data, x-width, y-height)
		}
		up(d) {
			this._data = null
		}
		static get label() { return ["🤚️", "move", true] }
	},
	Copy: class extends Stroke {
		down(d, v) {
			this.overlay()
			v.color = '#006bb7'
			v.pattern = 'black'
			this._start = this.start.Floor()
		}
		_bounds() {
			// todo: fix when dragging backwards
			const diff = this.pos.Floor().Subtract(this._start).Ceil()
			return [this._start.x, this._start.y, diff.x+1, diff.y+1]
		}
		move(d, v) {
			v.c2d.fillRect(...this._bounds())
		}
		up(d, v, c) {
			const data = d.c2d.getImageData(...this._bounds())
			c.when_copy(data)
		}
		static get label() { return ["✂️", "copy", true] }
	},
}
// idea: make copying erase copied pixels, select with the composite mode?

//// Brushes ////
// idea: is it best to use rects to define the brush? or a path around the perimeter?
// todo: check if its faster to draw using:
// - this addPath system
// - calling .rect() directly on the canvas
// - fillRect()
// - .setTransform(), then .fill(brushpath)
class Brush {
	path = new Path2D()
	constructor(origin, rects, size, diag=false, label) {
		for (const f of rects)
			this.path.rect(...f)
		this.size = size
		this.rects = rects
		this.origin = origin
		this.diag = diag
		this.label = label
	}
	add_to(path, pos) {
		const {x, y} = pos.Subtract(this.origin).Round()
		path.addPath(this.path, new DOMMatrixReadOnly([1,0,0,1,x,y]))
	}
	adjust_cursor(pos) {
		return pos.Subtract(this.origin).Round().Add(this.origin)
	}
	point(c2d, pos) {
		const path = new Path2D()
		this.add_to(path, pos)
		c2d.fill(path)
	}
	line(c2d, start, end) {
		start = this.adjust_cursor(start)
		end = this.adjust_cursor(end)
		$stroke.textContent = `${start} – ${end}`
		const path = new Path2D()
		let pos
		// there's definitely some redundant rounding going on here.
		// we dont need add_to to round when follow_line already does?
		for (pos of start.follow_line(start, end, this.diag))
			this.add_to(path, pos)
		c2d.fill(path)
		return pos
	}
	static Circle(d, ...etc) {
		const r = d/2, sr = r-0.5
		const fills = []
		for (let y=-sr; y<=sr; y++) {
			const x = Math.ceil(Math.sqrt(r*r - y*y)+sr)
			fills.push([x, y+sr, (r-x)*2, 1])
		}
		return new this(new Point(r, r), fills, d, ...etc)
	}
	static Square(d, ...etc) {
		const r = d/2
		return new this(new Point(r, r), [[0, 0, d, d]], d, ...etc)
	}
}
// todo: make this inherit from brush?
class ImageBrush {
	constructor(origin, image, colorize, diag=false, label) {
		this.diag = diag
		this.label = label
		this.size = 1
		this.colorize = colorize
		this.set_image(image, origin)
	}
	set_image(image, origin=new Point(image.width/2, image.height/2)) {
		this.source = image
		this.origin = origin
	}
	adjust_cursor(pos) {
		return pos.Subtract(this.origin).Round().Add(this.origin)
	}
	point(c2d, pos) {
		if (!this.source)
			return
		const {x, y} = pos.Subtract(this.origin).Round()
		c2d.drawImage(this.source, this.colorize?x:x+1000, y)
	}
	line(c2d, start, end) {
		if (!this.source)
			return
		start = this.adjust_cursor(start)
		end = this.adjust_cursor(end)
		let pos
		for (pos of start.follow_line(start, end, this.diag))
			this.point(c2d, pos)
		return pos
	}
}

class Grp {
	canvas = null
	c2d = null
	brush = null
	
	constructor(width, height) {
		Object.seal(this)
		
		const x = this.canvas = document.createElement('canvas')
		x.width = width
		x.height = height
		
		const c = this.c2d = this.canvas.getContext('2d')
		c.imageSmoothingEnabled = false
		c.shadowOffsetX = 1000
		c.shadowColor = "#000000"
		this.c2d.translate(-1000, 0)
	}
	set color(v) {
		this.c2d.shadowColor = v
	}
	set pattern(v) {
		this.c2d.fillStyle = v
	}
	set composite(v) {
		this.c2d.globalCompositeOperation = v
	}
	// used for overlay
	copy_settings(source) {
		this.brush = source.brush
		this.color = source.c2d.shadowColor
		this.pattern = source.c2d.fillStyle
		// note: dont copy composite
	}
	get_data() {
		return this.c2d.getImageData(0, 0, this.canvas.width, this.canvas.height)
	}
	put_data(data, x=0, y=0) { // hm this takes x,y... nnnn
		this.c2d.putImageData(data, x, y)
	}
	erase() {
		this.c2d.save()
		this.c2d.globalCompositeOperation = 'copy'
		this.c2d.resetTransform()
		this.c2d.clearRect(0, 0, this.canvas.width, this.canvas.height)
		this.c2d.restore()
	}
	clear() {
		this.c2d.fillRect(0, 0, this.canvas.width, this.canvas.height)
	}
	draw(pos) {
		this.brush.point(this.c2d, pos)
	}
	draw_line(start, end) {
		return this.brush.line(this.c2d, start, end)
	}
	// bad?
	random_in_brush(pos) {
		let r = new Point(Math.random()*20-10, Math.random()*20-10)
		r = this.brush.adjust_cursor(r).Add(this.brush.origin)
		// use the brush like a stencil. this also corrects for density at different sizes
		// todo: this breaks in colorize mode.
		if (this.c2d.isPointInPath(this.brush.path, r.x+.5-1000, r.y+.5)) {
			pos = pos.Add(r).Subtract(this.brush.origin)
			this.c2d.fillRect(pos.x, pos.y, 1, 1)
		}
	}
	// convert a hex color into a Uint32, in system endianness
	static color32(color=null) {
		if (!color)
			return 0
		const x = parseInt(color.slice(1), 16)
		return new Uint32Array(Uint8Array.of(x>>16, x>>8, x, 255).buffer)[0]
	}
	replace_color(before, after=null) {
		before = Grp.color32(before)
		after = Grp.color32(after)
		const data = this.get_data()
		new Uint32Array(data.data.buffer).forEach((n,i,d)=>{
			if (n==before)
				d[i] = after
		})
		this.put_data(data)
	}
	flood_fill(pos) {
		const size = this.brush.size-2
		// todo: make this a method on Brush
		const fill=(x1,x2,y)=>{ // fill from x1 to x2-1
			if (size==-1)
				this.c2d.fillRect(x1, y, x2-x1, 1)
			else if (size==0) {
				this.c2d.fillRect(x1-1, y, x2-x1+2, 1) // main
				this.c2d.fillRect(x1, y-1, x2-x1, 1) // above
				this.c2d.fillRect(x1, y+1, x2-x1, 1) // below
			} else
				this.c2d.fillRect(x1-size, y-size, x2-x1+size*2, 1+size*2)
		}
		
		const {x, y} = pos.Floor()
		const {width, height} = this.canvas
		const data = this.get_data()
		const pixels = new Uint32Array(data.data.buffer)
		const old = pixels[x + y*width]
		const check = (x, y)=>{
			if (pixels[x+y*width]==old) {
				pixels[x+y*width] = 0x00229900
				return true
			}
		}
		
		const queue = [[x, x, y, true]]
		while (queue.length) {
			const [left, right, y, dy] = queue.pop()
			let x = left-1
			span: while (1) {
				do if (++x > right) break span; while (!check(x, y))
				let start = x
				do ++x; while (x<width && check(x,y))
				if (start==left) {
					while (start-1>=0 && check(start-1, y))
						--start
					start<=left-2 && queue.push([start, left-2, y-dy, -dy])
				}
				if (dy===true)
					queue.push([start, x-1, y-dy, -dy]) // can do queue[0] = instead?
				queue.push([start, x-1, y+dy, +dy])
				fill(start, x, y)
			}
			right+2<=x-2 && queue.push([right+2, x-2, y-dy, -dy])
		}
	}
	// export as data url
	export() {
		const data = this.get_data()
		this.c2d.save()
		try {
			this.c2d.globalCompositeOperation = 'destination-over'
			this.c2d.fillStyle = '#e4d8a9'
			this.c2d.resetTransform()
			this.c2d.fillRect(0, 0, this.canvas.width, this.canvas.height)
			let options = "-moz-parse-options:transparency=no"
			if (CSS.supports('color-scheme:light')) // test for firefox version 96+
				options += ";png-zlib-level=9"
			return this.canvas.toDataURL('image/png', options)
		} finally {			
			this.c2d.restore()
			this.put_data(data)
		}
	}
	get_palette(lim) {
		let colors = new Set()
		const d = this.get_data().data
		for (let i=0; i<d.length; i+=4)
			if (d[i+3]) {
				colors.add(d[i]<<16|d[i+1]<<8|d[i+2])
				if (colors.size >= lim)
					break
			}
		return [...colors].map(x=>"#"+x.toString(16).padStart(6,"0"))
	}
}
// ehhh we can probably merge this back into chatdraw....
class Undo {
	constructor(max, get, put, onchange) {
		this.max = max // todo: max
		this.get = get
		this.put = put
		this.onchange = onchange
		this.reset()
	}
	reset() {
		this.states = []
		this.pos = 0
		this.onchange(false, false)
	}
	add() {
		this.states.splice(this.pos, 9e9, this.get())
		if (this.states.length <= this.max)
			this.pos++
		else
			this.states.shift()
		this.onchange(true, false)
	}
	can(redo) {
		return redo ? this.pos<this.states.length : this.pos>0
	}
	do(redo) {
		// 0 1 2 [3] 4 5 - 3+ are redos
		if (!this.can(redo))
			return
		if (!redo) this.pos--
		const data = this.states[this.pos]
		this.states[this.pos] = this.get()
		if (redo) this.pos++
		this.put(data)
		this.onchange(this.can(false), this.can(true))
	}
}

// todo: clipboard color palette can desync..
// can do color swap on it whenever the palette changes i guess?
// but that can result in data loss.. ooh maybe um
// store current palette when capturing clipboard, and then map the colors when loading ?
// perhaps allow saving multiple clipboards depending on some unused menu field, (like, which color is selected)
// actually yeah that would be good for uh, the clipboard brush that ignores current color...
// though, not for the one which uses it (not sure if i'll keep this mode?)
// perhaps use the selected dither pattern as the clipboard index then?

// also, consider this:
// right now we draw images using um
// drawimage, and stroke color is the dither pattern (ignored)
// but, we could use fillrect with the stroke pattern set to the clipboard image and repeat disabled... um what does that actually give us.. idk

// idea: we dont need to keep the radio buttons grouped up like this
// ex: we could put all the options for using the clipboard in one spot
// or put the Erase composite mode along with the colors
// etc.
// note: i also generally think that the composite mode should go next to colors
// ok just swapped it with brush. maybe good.
