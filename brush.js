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
	Lerp(p, t) {
		return new Point(this.x*(1-t)+p.x*t, this.y*(1-t)+p.y*t)
	}
	
	c_dist(p) { return Math.max(Math.abs(this.x-p.x), Math.abs(this.y-p.y)) }
	
	* follow_line(start, end, diag=true) {
		let diff = end.Subtract(start)
		let step_v, step_h
		if (diag) {
			step_v = new Point(Math.sign(diff.x), Math.sign(diff.y))
			if (Math.abs(diff.x) >= Math.abs(diff.y))
				step_h = new Point(Math.sign(diff.x), 0)
			else
				step_h = new Point(0, Math.sign(diff.y))
		} else {
			step_v = new Point(0, Math.sign(diff.y))
			step_h = new Point(Math.sign(diff.x), 0)
		}
		let i=1000
		for (let pos=this,step=step_v; pos.c_dist(end)>0.5; pos=pos.Add(step)) {
			if (i--<0)
				throw new Error(`infinite loop drawing line\nfrom ${start} to ${end} (diag: ${diag})`)
			yield pos
			// choose step that takes us closest to the ideal line
			if (step_h.x || step_h.y) {
				let horz = Math.abs(diff.x*(pos.y-start.y+step_h.y) - diff.y*(pos.x-start.x+step_h.x))
				let vert = Math.abs(diff.x*(pos.y-start.y+step_v.y) - diff.y*(pos.x-start.x+step_v.x))
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
	static PointerDown(ev, context) {
		let st = new this(ev, context)
		Stroke.pointers.set(ev.pointerId, st)
		st.down(st.context)
		return st
	}
	static pointer_move(ev) {
		let st = Stroke.pointers.get(ev.pointerId)
		if (st) {
			st.update(ev)
			st[st.type](st.context)
			return st
		}
	}
	static pointer_lost(ev) {
		Stroke.pointers.delete(ev.pointerId)
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
		
		let scale = Point.FromRect(target.getBoundingClientRect()).Divide(Point.FromRect(target))
		
		let ps = 1/window.devicePixelRatio/2
		let adjust = new Point(ps, ps).Divide(scale)
		
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
class Spray extends Stroke {
	down(d) {
		this.move(d)
	}
	move(d) {
		for (let i=0;i<10;i++)
			d.random_in_brush(this.pos)
	}
}
Spray.label = "spray"
class LineTool extends Stroke {
	up(d) {
		d.draw_line(this.start, this.pos)
	}
}
LineTool.label = "line"
class Slow extends Stroke {
	down(d) {
		this._avg = this.pos
	}
	move(d) {
		let pos = this._avg.Lerp(this.pos, 0.15)
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


class Brush extends Path2D {
	constructor(origin, fills) {
		super()
		for (const f of fills)
			super.rect(...f)
		this.origin = origin
		this.fills = fills
	}
	add_to(path, pos) {
		const {x, y} = pos.Subtract(this.origin).Round()
		path.addPath(this, new DOMMatrixReadOnly([1,0,0,1,x,y]))
	}
	adjust_cursor(pos) {
		return pos.Subtract(this.origin).Round().Add(this.origin)
	}
	point(pos) {
		const path = new Path2D()
		this.add_to(path, pos)
		return path
	}
	line(start, end) {
		const path = new Path2D()
		start = this.adjust_cursor(start)
		end = this.adjust_cursor(end)
		let pos
		for (pos of start.follow_line(start, end))
			this.add_to(path, pos)
		return [path, pos]
	}
	static Circle(d) {
		const r = d/2, sr = r-0.5
		const fills = []
		for (let y=-sr; y<=sr; y++) {
			const x = Math.ceil(Math.sqrt(r*r - y*y)+sr)
			fills.push([x, y+sr, (r-x)*2, 1])
		}
		return new this(new Point(r, r), fills)
	}
}


// todo: class for specifically the canvas (setting up, and drawing methods) and move everything else into the chatdraw class (incl. cursor handling) 
// goal: main and overlay canvas should be instances of that class

class Grp {
	constructor(width, height) {
		const x = this.canvas = document.createElement('canvas')
		x.width = width
		x.height = height
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
	
	get_data() {
		return this.c2d.getImageData(0, 0, this.canvas.width, this.canvas.height)
	}
	put_data(data) {
		this.c2d.putImageData(data, 0, 0)
	}
	clear(all) {
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
		const [path, pos] = this.brush.line(start, end)
		this.c2d.fill(path)
		return pos
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
	
	// technically speaking, this should be a  Brush? since it generates a path to fill (kinda)
	// or we could use the current brush rather than fillrect here. which would allow implementing an.. erode-like operator? not sure how useful that would be tho.
	flood_fill(pos, brush=false) {
		const {x, y} = pos.Floor()
		const {width, height} = this.canvas
		const data = this.get_data()
		const pixels = new Uint32Array(data.data.buffer)
		const old = pixels[x + y*width]
		const queue = [[x+1, x, y, -1]]
		const size = this.brush.fills.length-1
		// fills pixels in a horizontal line, starting from (x,y),
		// until it hits a wall or reaches x=limit
		const to_wall = (x, y, dx, limit)=>{
			for (; x!=limit+dx && pixels[x+y*width]==old; x+=dx)
				pixels[x+y*width] = 0x00229900 // arbitrary fill color
			return x-dx
		}
		// find fillable areas in row y, between x=left and x=right
		const find_spans = (left, right, y, dir)=>{
			y += dir
			if (y<0 || y>=height)
				return
			for (let x=left; x<=right; x++) {
				const stop = to_wall(x, y, +1, right)
				if (stop >= x) {
					queue.push([x, stop, y, dir])
					x = stop
				}
			}
		}
		while (queue.length) {
			const [x1, x2, y, dir] = queue.pop()
			// expand span
			const left = to_wall(x1-1, y, -1, 0)
			const right = to_wall(x2+1, y, +1, width-1)
			this.c2d.fillRect(left-size, y-size, right-left+1+size*2, 1+size*2)
			// check row backwards:
			if (x2<x1) {
				// (this only happens on the first iteration)
				find_spans(left, right, y, -dir)
			} else {
				find_spans(left, x1-2, y, -dir)
				find_spans(x2+2, right, y, -dir)
			}
			// check row forwards:
			find_spans(left, right, y, dir)
		}
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
		this.pos++
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
		let width=200, height=100
		super()
		/// create canvas ///
		this.grp = new Grp(width, height)
		let canvas = this.grp.canvas
		/// create form ///
		this.form = document.createElement('form')
		this.form.autocomplete = 'off'
		this.form.method = 'dialog'
		this.form.onchange = ev=>{
			let e = ev.target
			if (e.type=='radio')
				this.choices[e.name].change(e.value)
			else if (e.type=='color')
				this.actions[e.name](e.value)
		}
		this.form.onclick = ev=>{
			let e = ev.target
			if (e.type=='button')
				this.actions[e.name]()
		}
		/// define choices ///
		this.tool = null
		this.choices = {
			// i kinda... these could be classes...
			tool: new Choices(
				'tool',
				[Freehand, Slow, LineTool, Spray, Flood/*, Flood2*/],
				v=>this.tool = v,
				v=>v.label
			),
			color: new Choices(
				'color',
				[],
				v=>{
					this.form.pick.value = v
					this.grp.color = v
				},
				v=>""
			),
			brush: new Choices(
				'brush',
				[],
				v=>this.grp.brush = v,
				(v,i)=>`${i+1}`
			),
			pattern: new Choices(
				'pattern',
				[],
				v=>this.grp.pattern = v,
				v=>v._canvas
			),
			comp: new Choices(
				'comp',
		 		['source-over', 'destination-over', 'source-atop', 'destination-out'],
				v=>this.grp.composite = v,
				v=>{
					return {
						'source-over':"all",
						'destination-over':"under",
						'source-atop':"in",
						'destination-out':"erase"
					}[v]
				}
			),
		}
		for (let i=1; i<=8; i++)
			this.choices.brush.values.push(Brush.Circle(i))
		for (let i=0; i<16; i++)
			this.choices.pattern.values.push(dither_pattern(i, this.grp.c2d))
		this.set_palette2(['#000000','#FFFFFF','#FF0000','#0000FF','#00FF00','#FFFF00']) //["#000000","#FFFFFF","#ca2424","#7575e8","#25aa25","#ebce30"])
		/// define button actions ///
		this.actions = {
			pick: color=>{
				let sel = this.sel_color()
				let old = this.choices.color.get(sel)
				this.history.add()
				this.grp.replace_color(old, color)
				this.set_palette(sel, color)
			},
			clear: ()=>{
				this.history.add()
				this.grp.clear(true)
			},
			fill: ()=>{
				this.history.add()
				this.grp.clear(false)
			},
			bg: ()=>{
				// color here should this.c2d.shadowColor but just in case..
				let sel = this.sel_color()
				let color = this.choices.color.get(sel)
				this.history.add()
				this.grp.replace_color(color)
			},
			undo: ()=>this.history.do(false),
			redo: ()=>this.history.do(true),
		}
		/// draw form ///
		draw_form(this.form, [
			{title:'Tools', cols:3, items:[
				{name:'clear', text:"reset!"},
				{name:'undo', text:"↶", icon:true},
				{name:'redo', text:"↷", icon:true},
				{name:'fill', text:"fill"},
				...this.choices.tool.bdef(),
			]},
			{title:'Draw Mode', items:this.choices.comp.bdef()},
			{title:"Brushes", size:1, items:this.choices.brush.bdef()},
			{title:"Colors", cols:2, items:[
				{name:'pick', type:'color', text:"edit"},
				{name:'bg', text:"➙bg"},
				...this.choices.color.bdef(),
			]},
			{title:"Patterns", size:1, flow:'column', items:this.choices.pattern.bdef()},
		])
		/// undo buffer ///
		this.history = new Undo(
			20,
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
		super.attachShadow({mode: 'open'})
		super.shadowRoot.append(document.importNode(ChatDraw.style, true), canvas, this.form)
		
		this.choose('tool', 0)
		this.choose('brush', 1)
		this.choose('comp', 0)
		this.choose('color', 0)
		this.choose('pattern', 15)
		
		this.grp.clear(true)
		
		canvas.style.cursor = make_cursor(3)
		/// stroke handling: ///
		canvas.onpointerdown = ev=>{
			this.history.add()
			this.tool.PointerDown(ev, this.grp)
		}
		canvas.onpointermove = canvas.onpointerup = ev=>{
			Stroke.pointer_move(ev)
		}
		canvas.onlostpointercapture = ev=>{
			Stroke.pointer_lost(ev)
		}
	}
	
	set_scale(n) {
		this.style.setProperty('--scale', n)
	}
	choose(name, item) {
		this.form.elements[name][item].click()
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
