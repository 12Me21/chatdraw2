"use strict"

class Choices {
	constructor(name, values, change, label) {
		this.name = name
		this.values = values
		this.onchange = change
		this.label = label
	}
	change(value) {
		this.onchange(this.values[value])
	}
	get(key) {
		return this.values[key]
	}
	bdef() {
		return this.values.map((x,i)=>{
			return {type:'radio', name:this.name, text:this.label(x,i), value:i}
		})
	}
}

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
		let i=1000
		for (let pos=this,step=step_v; pos.c_dist(end)>0.5; pos=pos.Add(step)) {
			if (i--<0)
				throw new Error(`infinite loop drawing line
from ${start} to ${end} (diag: ${diag})`)
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
	static PointerDown(ev, ...context) {
		const st = new this(ev, context)
		Stroke.pointers.set(ev.pointerId, st)
		st.down(...st.context)
		return st
	}
	static handle(canvas, down) {
		canvas.onpointerdown = down
		canvas.onpointermove = canvas.onpointerup = ev=>{
			const st = this.pointers.get(ev.pointerId)
			if (st) {
				st.update(ev)
				st[st.type](...st.context)
			}
		}
		canvas.onlostpointercapture = ev=>{
			this.pointers.delete(ev.pointerId)
		}
	}
	
	constructor(ev, context) {
		ev.target.setPointerCapture(ev.pointerId)
		this.pos = null
		this.update(ev)
		this.start = this.pos
		this.context = context
	}
	update({target, offsetX, offsetY, type}) {
		this.old = this.pos
		this.type = type.slice(7)
		
		const scale = Point.FromRect(target.getBoundingClientRect()).Divide(Point.FromRect(target))
		
		const ps = 1/window.devicePixelRatio/2
		const adjust = new Point(ps, ps).Divide(scale)
		
		this.pos = new Point(offsetX, offsetY).Add(adjust).Divide(scale)
	}
	down(){}
	move(){}
	up(){}
}
Stroke.pointers = new Map()

// or wait actually, tool should extend Stroke maybe!! yeah !
class Freehand extends Stroke {
	down(d) {
		this._old = this.pos
		d.draw(this.pos)
	}
	move(d) {
		this._old = d.draw_line(this._old, this.pos)
	}
}
Freehand.label = "pen"
// idea: spray that uses dither somehow? like, fills in based on ordered dithering? perhaps it umm.. like first fill in every pixel that lines up with pixel 0 in the pattern, then do pixel 1, etc..
class Spray extends Stroke {
	down(d) {
		this.move(d)
	}
	move(d) {
		for (let i=0;i<50;i++)
			d.random_in_brush(this.pos)
	}
}
Spray.label = "spray"
class LineTool extends Stroke {
	down(d, v) {
		// TODO: we need to "lock" the overlay, because 2 strokes can be drawn at the same time with a touchscreen
		// or somehow support this properly?
		// could use like, xor mode perhaps..
		v.copy_settings(d)
		v.erase()
	}
	move(d, v) {
		v.erase()
		v.draw_line(this.start, this.pos)
	}
	up(d, v) {
		v.erase()
		d.draw_line(this.start, this.pos)
	}
}
LineTool.label = "line"
class PlaceTool extends Stroke {
	down(d, v) {
		v.copy_settings(d)
		this.move(d, v)
	}
	move(d, v) {
		v.erase()
		v.draw(this.pos)
	}
	up(d, v) {
		v.erase()
		d.draw(this.pos)
	}
}
PlaceTool.label = "place"
class Slow extends Stroke {
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
}
Slow.label = "slow"

class Flood extends Stroke {
	down(d) {
		d.flood_fill(this.pos)
	}
}
Flood.label = "flood"

class Mover extends Stroke {
	down(d) {
		this._data = d.get_data()
	}
	move(d) {
		const ofs = this.pos.Subtract(this.start).Round() // todo: round better
		let {x, y} = ofs
		let {width, height} = d.canvas
		x = (x+width*1000) % width
		y = (y+height*1000) % height
		d.put_data(this._data, x, y)
		d.put_data(this._data, x-width, y)
		d.put_data(this._data, x, y-height)
		d.put_data(this._data, x-width, y-height)
	}
	up(d) {
		this._data = null
	}
}
Mover.label = "move"
class CopyTool extends Stroke {
	down(d, v) {
		// TODO: we need to "lock" the overlay, because 2 strokes can be drawn at the same time with a touchscreen
		// or somehow support this properly?
		// could use like, xor mode perhaps..
		v.color = '#006BB7'
		v.pattern = 'black'
		v.erase()
		this._start = this.start.Floor()
	}
	move(d, v) {
		v.erase()
		v.c2d.fillRect(...this._bounds())
	}
	_bounds() {
		// todo: fix when dragging backwards
		const diff = this.pos.Floor().Subtract(this._start).Ceil()
		return [this._start.x, this._start.y, diff.x+1, diff.y+1]
	}
	up(d, v, c) {
		let data = d.c2d.getImageData(...this._bounds())
		c.when_copy(data)
		v.erase()
	}
}
CopyTool.label = "copy"


// idea: is it best to use rects to define the brush? or a path around the perimeter
class Brush extends Path2D {
	constructor(origin, fills, name, diag=false) {
		super()
		for (const f of fills)
			super.rect(...f)
		this.origin = origin
		this.fills = fills
		this.diag = diag
		this.label = name
	}
	add_to(path, pos) {
		const {x, y} = pos.Subtract(this.origin).Round()
		path.addPath(this, new DOMMatrixReadOnly([1,0,0,1,x,y]))
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
		const path = new Path2D()
		start = this.adjust_cursor(start)
		end = this.adjust_cursor(end)
		let pos
		for (pos of start.follow_line(start, end, this.diag))
			this.add_to(path, pos)
		c2d.fill(path)
		return pos
	}
	static Circle(d, name, diag) {
		const r = d/2, sr = r-0.5
		const fills = []
		for (let y=-sr; y<=sr; y++) {
			const x = Math.ceil(Math.sqrt(r*r - y*y)+sr)
			fills.push([x, y+sr, (r-x)*2, 1])
		}
		return new this(new Point(r, r), fills, name, diag)
	}
}
class ImageBrush {
	constructor(origin, image, name, diag=false, color=false) {
		this.origin = origin
		this.source = image
		this.diag = diag
		this.label = name
		this.color = color
	}
	adjust_cursor(pos) {
		return pos.Subtract(this.origin).Round().Add(this.origin)
	}
	point(c2d, pos) {
		pos = pos.Subtract(this.origin)
		c2d.drawImage(this.source, this.color?pos.x:pos.x+1000, pos.y)
	}
	line(c2d, start, end) {
		start = this.adjust_cursor(start)
		end = this.adjust_cursor(end)
		let pos
		for (pos of start.follow_line(start, end, this.diag))
			this.point(c2d, pos)
		return pos
	}
}


// todo: class for specifically the canvas (setting up, and drawing methods) and move everything else into the chatdraw class (incl. cursor handling) 
// goal: main and overlay canvas should be instances of that class

class Grp {
	constructor(width, height) {
		const x = this.canvas = document.createElement('canvas')
		x.width = width
		x.height = height
		// should these be on like, root elem?
		x.style.setProperty('--width', width)
		x.style.setProperty('--height', height)
		x.style.imageRendering = '-moz-crisp-edges'
		x.style.imageRendering = 'pixelated'
		x.style.touchAction = 'none'
		
		const c = this.c2d = this.canvas.getContext('2d')
		c.imageSmoothingEnabled = false
		c.shadowOffsetX = 1000
		c.translate(-c.shadowOffsetX, 0)
		
		this.brush = null
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
	
	copy_settings(source) {
		this.brush = source.brush
		this.color = source.c2d.shadowColor
		this.pattern = source.c2d.fillStyle
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
		this.c2d.clearRect(1000, 0, this.canvas.width, this.canvas.height)
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
		if (this.c2d.isPointInPath(this.brush, r.x+.5-1000, r.y+.5)) {
			pos = pos.Add(r).Subtract(this.brush.origin)
			this.c2d.fillRect(pos.x, pos.y, 1, 1)
		}
	}
	// convert a hex color into a Uint32, in system endianness
	color32(color=null) {
		if (!color)
			return 0
		const x = parseInt(color.slice(1), 16)
		return new Uint32Array(Uint8Array.of(x>>16, x>>8, x, 255).buffer)[0]
	}
	replace_color(before, after=null) {
		before = this.color32(before)
		after = this.color32(after)
		const data = this.get_data()
		new Uint32Array(data.data.buffer).forEach((n,i,d)=>{
			if (n==before)
				d[i] = after
		})
		this.put_data(data)
	}
	flood_fill(pos) {
		const {x, y} = pos.Floor()
		const {width, height} = this.canvas
		const data = this.get_data()
		const pixels = new Uint32Array(data.data.buffer)
		const size = this.brush.fills.length-2
		
		const old = pixels[x + y*width]
		
		dbc.clearRect(0,0,width,height)
		dbc.putImageData(data, 0, 0)
		let counts = new Int32Array(width*height).fill(0)
		let cc = ['transparent','red','orange','yellow','green','cyan','purple']
		let count=(x,y,w=1)=>{
			for (let i=0;i<w;i++) {
				let c = ++counts[x+y*width]
				dbc.fillStyle = cc[c]
				dbc.fillRect(x,y,1,1)
			}
		}
		
		const check = (x, y)=>{
			count(x,y)
			if (pixels[x+y*width]==old) {
				pixels[x+y*width] = 0x00229900
				return true
			}
		}
		
		const queue = []
		const fill = (x1,x2,y,dir,paint)=>{
			if (paint) {
				this.c2d.fillRect(x1, y, x2-x1+1, 1)
				//count(x1, y, x2-x1+1)
			}
			queue.push([x1, x2, y+dir, dir])
		}
		check(x,y)
		let left = x, right=x
		while (left>0 && check(left-1,y))
			left--
		while (right<width-1 && check(right+1,y))
			right++
		fill(left, right, y, -1, true)
		fill(left, right, y, 1)
		
		let _span = (l,r,y,col)=>{
			if (r>=l) {
				//dbc.fillStyle = col
				//dbc.fillRect(l,y,r-l+1,1)
			}
		}
		
		while (queue.length) {
			const [left, right, y, dir] = queue.pop()
			let start = left, x = left
			let nf
			let st=left
			_span(left, right, y, '#AAA')
			let state = check(left, y)
			if (state) {
				while (start>0 && check(start-1, y))
					start--
				if (start<=left-2)
					fill(start, left-2, y, -dir) //technically, we know that this span will not extend further right, because we know there is a wall at (left-1, y) so when this span is checked later, we should not check pixels past its right boundary. but eh
				st=start
			}
			while (1) {
				x++
				if (x<width && check(x,y)) {
					if (!state) {
						start = x
						state = true
					}
				} else {
					if (state) {
						fill(start, x-1, y, dir, true)
						_span(start, x-1, y, '#0C0')
						state = false
					}
					if (x>=right)
						break
				}
			}
			_span(st, left-1, y, '#08F')
			_span(right+1, x-1, y, 'red')
			if (x-1>=right+2)
				fill(right+2, x-1, y, -dir)
		}
	}
	put_image(source, pos) {
		this.c2d.drawImage(source, pos.x+1000, pos.y)
	}
}

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

class ChatDraw extends HTMLElement {
	constructor() {
		const width=200, height=100
		super()
		this.grp = new Grp(width, height)
		this.overlay = new Grp(width, height)
		this.overlay.c2d.globalAlpha = 0.7
		this.grp.canvas.classList.add('main')
		/// define choices ///
		this.tool = null
		let brushes = [], patterns = []
		brushes.push(new Brush(new Point(0,0), [], "CB", false))
		brushes.push(new Brush(new Point(0,0), [], "CB", false))
		brushes.push(Brush.Circle(1, "1", true))
		brushes.push(Brush.Circle(1, "1.5", false))
		brushes.push(Brush.Circle(2, "2", true))
		brushes.push(Brush.Circle(2, "2.5", false))
		brushes.push(Brush.Circle(3, "3", true))
		brushes.push(Brush.Circle(3, "3.5", false))
		for (let i=4; i<=8; i++)
			brushes.push(Brush.Circle(i, `●${i}`,true))
		brushes.push(new Brush(new Point(2.5,2.5), [
			[0,0,1,1],// wonder if we should store these as like, DOMRect?
			[1,1,1,1],
			[2,2,1,1],
			[3,3,1,1],
			[4,4,1,1],
		], "\\5", false))
		// we can't enable diagonal on this brush, since
		// it's too thin. but technically, diagonal should work on some axes. would be nice to like, say, ok you're allowed to move in these directions:
		// [][]  
		// []()[]
		//   [][]
		// this would not be too hard to implement, either. we just pick the 2 points that straddle the line being drawn
		// (we could even do like, a dashed line? by allowing only movements of 2px at a time?)
		brushes.push(new Brush(new Point(0.5,2.5), [
			[0,0,1,1],
			[0,1,1,1],
			[0,2,1,1],
			[0,3,1,1],
			[0,4,1,1],
		], "|5", true))
		let cb = dither_pattern(-1, this.grp.c2d)
		cb._canvas = "\bCB"
		patterns.push(cb)
		for (let i=0; i<16; i++)
			patterns.push(dither_pattern(i, this.grp.c2d))
		this.choices = {
			tool: new Choices(
				'tool', [Mover, CopyTool, Freehand, Slow, LineTool, Spray, Flood, PlaceTool],
				v=>this.tool = v,
				v=>v.label
			),
			color: new Choices(
				'color', ['#000000','#FFFFFF','#FF0000','#2040EE','#00CC00','#FFFF00'], //["#000000","#FFFFFF","#ca2424","#7575e8","#25aa25","#ebce30"])
				v=>{
					this.form.pick.value = v
					this.grp.color = v
				},
				v=>""
			),
			brush: new Choices(
				'brush', brushes,
				v=>this.grp.brush = v,
				v=>"\b"+v.label
			),
			pattern: new Choices(
				'pattern', patterns,
				v=>this.grp.pattern = v,
				v=>v._canvas
			),
			composite: new Choices(
				'composite', ['source-over', 'destination-over', 'source-atop', 'destination-out'],
				v=>this.grp.composite = v,
				v=>({
					'source-over':"over",
					'destination-over':"under",
					'source-atop':"in",
					'destination-out':"erase",
					'copy':"copy", // this is only useful when pasting
				}[v])
			),
		}
		/// define button actions ///
		let actions = {
			pick: color=>{
				const sel = this.sel_color()
				const old = this.choices.color.get(sel)
				this.history.add()
				this.grp.replace_color(old, color)
				this.set_palette(sel, color)
			},
			clear: ()=>{
				this.history.add()
				this.grp.erase()
			},
			fill: ()=>{
				this.history.add()
				this.grp.clear()
			},
			bg: ()=>{
				// color here should this.c2d.shadowColor but just in case..
				const sel = this.sel_color()
				const color = this.choices.color.get(sel)
				this.history.add()
				this.grp.replace_color(color)
			},
			undo: ()=>this.history.do(false),
			redo: ()=>this.history.do(true),
		}
		/// draw form ///
		this.form = draw_form(this.choices, actions, [
			{title:"Tool", cols:3, items:[
				{name:'clear', text:"reset!"},
				{name:'undo', text:"↶", icon:true},
				{name:'redo', text:"↷", icon:true},
				{name:'fill', text:"fill"},
				...this.choices.tool.bdef(),
			]},
			{title:"Brush", rows:8, size:1, items:this.choices.brush.bdef()},
			{title:"Composite", rows:4, items:this.choices.composite.bdef()},
			{title:"Color", cols:2, items:[
				{name:'pick', type:'color', text:"edit"},
				{name:'bg', text:"➙bg"},
				...this.choices.color.bdef(),
			]},
			{title:"Pattern", rows:8, size:1, items:this.choices.pattern.bdef()},
		])
		/// undo buffer ///
		this.history = new Undo(
			50,
			()=>({
				data: this.grp.get_data(),
				palette: [...this.choices.color.values],
			}),
			(data)=>{
				this.grp.put_data(data.data)
				this.set_palette2(data.palette)
			},
			(can_undo, can_redo)=>{
				this.form.undo.disabled = !can_undo
				this.form.redo.disabled = !can_redo
			}
		)
		/// final preparations ///
		this.set_palette2(this.choices.color.values)
		this.grp.erase()
		
		Stroke.handle(this.grp.canvas, ev=>{
			this.history.add()
			this.tool.PointerDown(ev, this.grp, this.overlay, this)
		})
		
		this.grp.canvas.style.cursor = make_cursor(3)
		
		super.attachShadow({mode: 'open'})
		super.shadowRoot.append(document.importNode(ChatDraw.style, true), this.grp.canvas, this.overlay.canvas, this.form)
		
		this.choose('tool', 2)
		this.choose('brush', 4)
		this.choose('composite', 0)
		this.choose('color', 0)
		this.choose('pattern', 16)
	}
	// idea: what if all tools just draw to the overlay, then we copy to main canvas at the end of the stroke? and update undo buffer..
	// ugh but that would be slow maybe?
	
	connectedCallback() {
	}
	
	when_copy(data) {
		let c = document.createElement('canvas')
		c.width = data.width
		c.height = data.height
		let c2d = c.getContext('2d')
		c2d.putImageData(data, 0, 0)
		this.clipboard = c
		// todo: setting values like this wont update the current value if its already selected
		this.choices.pattern.values[0] = this.grp.c2d.createPattern(c, 'repeat')
		this.choices.brush.values[0] = new ImageBrush(new Point(c.width/2, c.height/2), c, 'CB', false, false)
		this.choices.brush.values[1] = new ImageBrush(new Point(c.width/2, c.height/2), c, 'CB', false, true)
		this.choose('tool', 7) // prevent accidental overwriting
		this.choose('brush', 0)
	}
	
	set_scale(n) {
		this.style.setProperty('--scale', n)
	}
	// fsr .click doesn't work everywhere?
	choose(name, value) {
		let elem = this.form.querySelector(`input[name="${name}"][value="${value}"]`)
		elem.checked = true
		elem.dispatchEvent(new Event('change', {bubbles:true}))
	}
	set_palette2(colors) {
		colors.forEach((c,i)=>this.set_palette(i, c))
	}
	set_palette(i, color) {
		this.form.style.setProperty(`--color-${i}`, color)
		this.choices.color.values[i] = color
		if (i==this.sel_color())
			this.choices.color.change(i)
	}
	// which color index is selected
	sel_color() {
		if (this.form.color)
			return +this.form.color.value
	}
}
ChatDraw.style = document.createElement('link')
ChatDraw.style.rel = 'stylesheet'
ChatDraw.style.href = 'style.css'

customElements.define('chat-draw', ChatDraw)

// idea: instead of a Paste tool, have a paste BRUSH
// then, have a "place" tool or whatever
// so you can select the clipboard "brush", and either draw with the pen etc. or use Place to place it more precisely
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
