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
		let pos = this._avg.Lerp(this.pos, this.speed)
		d.draw_line(this._avg, pos)
		this._avg = pos
	}
	up(d) {
		this.move(d)
	}
}
Slow.prototype.speed = 0.15
Slow.label = "slow"

class Flood extends Stroke {
	down(d) {
		d.flood_fill(this.pos)
	}
}
Flood.label = "flood"

class Flood2 extends Stroke {
	down(d) {
		d.flood_fill(this.pos, true)
	}
}
Flood2.label = "flood2"


class Brush extends Path2D {
	constructor(origin, fills) {
		super()
		for (let f of fills)
			super.rect(...f)
		this.origin = origin
		this.fills = fills
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
		let a = this.adjust_cursor(start)
		let b = this.adjust_cursor(end)
		let pos
		for (pos of a.follow_line(a, b)) {
			if (i++>400)
				throw new Error(`Infinite loop when drawing line:\nfrom ${start} to ${end}.`)
			this.add_to(path, pos)
		}
		return [path, pos]
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


// todo: class for specifically the canvas (setting up, and drawing methods) and move everything else into the chatdraw class (incl. cursor handling) 
// goal: main and overlay canvas should be instances of that class

class Drawer {
	constructor(width, height) {
		this.canvas = document.createElement('canvas')
		this.canvas.width = width
		this.canvas.height = height
		/*Object.assign(this.canvas, {
			style: {
				imageRendering: = '-moz-crisp-edges'
			}
		})*/
		this.canvas.style.setProperty('--width', width)
		this.canvas.style.setProperty('--height', height)
		this.canvas.style.imageRendering = '-moz-crisp-edges'
		this.canvas.style.imageRendering = 'pixelated'
		this.canvas.style.touchAction = 'none'
		
		this.c2d = this.canvas.getContext('2d')
		this.c2d.imageSmoothingEnabled = false
		this.c2d.shadowOffsetX = 1000
		this.c2d.translate(-1000, 0)
		
		this.form = document.createElement('form')
		this.form.autocomplete = 'off'
		this.form.method = 'dialog'
		
		this.history_max = 20
		//this.history_reset()
		//this.clear(true)
		
		this.choices = {
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
					this.c2d.shadowColor = v
				},
				v=>""
			),
			brush: new Choices(
				'brush',
				[],
				v=>this.brush = v,
				(v,i)=>`${i+1}`
			),
			pattern: new Choices(
				'pattern',
				[],
				v=>this.c2d.fillStyle = v,
				null
			),
			comp: new Choices(
				'comp',
				['source-over', 'destination-over', 'source-atop', 'destination-out'],
				v=>this.c2d.globalCompositeOperation = v,
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
		this.actions = {
			pick: color=>{
				let sel = this.sel_color()
				let old = this.choices.color.get(sel)
				this.replace_color(old, color)
				this.set_palette(sel, color)
			},
			
			clear: ()=>this.clear(true),
			fill: ()=>this.clear(false),
			bg: ()=>{
				// color here should this.c2d.shadowColor but just in case..
				let sel = this.sel_color()
				let color = this.choices.color.get(sel)
				this.replace_color(color)
			},
			undo: ()=>this.history_do(false),
			redo: ()=>this.history_do(true),
		}
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
		
		this.brush = null
		this.tool = null
		
		// ready
		//this.history_reset()
		//this.clear(true)
		
		// stroke handling:
		this.canvas.onpointerdown = ev=>{
			this.history_add()
			this.tool.PointerDown(ev, this)
		}
		this.canvas.onpointermove = this.canvas.onpointerup = ev=>{
			Stroke.pointer_move(ev)
		}
		this.canvas.onlostpointercapture = ev=>{
			Stroke.pointer_lost(ev)
		}
	}
	
	/////////////////
	/// undo/redo ///
	/////////////////
	
	// TODO: save/restore the palette!!
	history_get() {
		return {
			data: this.get_data(),
			palette: [...this.choices.color.values],
		}
	}
	history_put(data) {
		this.put_data(data.data)
		this.set_palette2(data.palette)
	}
	// clear
	history_reset() {
		this.history = []
		this.history_pos = 0
		this.history_onchange()
	}
	// push state
	history_add() {
		this.history.splice(this.history_pos, 9e9, this.history_get())
		this.history_pos++
		this.history_onchange()
	}
	history_can(redo) {
		return redo ? this.history_pos<this.history.length : this.history_pos>0
		//return this.history_pos!=(redo?this.history.length:0)
	}
	// undo/redo
	history_do(redo) {
		// 0 1 2 [3] 4 5 - 3+ are redos
		// 
		if (!this.history_can(redo))
			return
		if (!redo) {
			this.history_pos--
			let data = this.history[this.history_pos]
			this.history[this.history_pos] = this.history_get()
			this.history_put(data)
			this.history_onchange()
		} else {
			let data = this.history[this.history_pos]
			this.history[this.history_pos] = this.history_get()
			this.history_pos++
			this.history_put(data)
			this.history_onchange()
		}
	}
	history_onchange() {
		this.form.undo.disabled = !this.history_can(false)
		this.form.redo.disabled = !this.history_can(true)
	}
	/////////////////////
	/// setting state ///
	/////////////////////
	set_palette2(colors) {
		colors.forEach((c,i)=>{
			this.set_palette(i, c)
		})
	}
	set_palette(i, color) {
		this.form.style.setProperty(`--color-${i}`, color)
		this.choices.color.values[i] = color
		if (i==this.sel_color())
			this.choices.color.change(i)
	}
	sel_color() {
		if (!this.form.color)
			return null
		return +this.form.color.value
	}
	choose(name, item) {
		this.form.elements[name][item].click()
	}
	
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
		let [path, pos] = this.brush.line(start, end)
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
	
	// technically speaking, this should be a  Brush? since it generates a path to fill (kinda)
	// or we could use the current brush rather than fillrect here. which would allow implementing an.. erode-like operator? not sure how useful that would be tho.
	flood_fill(pos, brush=false) {
		let {x,y} = pos.Floor()
		let data = this.get_data()
		let pixels = new Uint32Array(data.data.buffer)
		let {width, height} = this.canvas
		let old = pixels[x + y*width]
		
		// fills pixels in a horizontal line, starting from (x,y),
		// until it hits a wall or reaches x=limit
		let to_wall = (x, y, dx, limit)=>{
			while (x!=limit+dx && pixels[x + y*width]==old) {
				pixels[x + y*width] = 0x00229900 // arbitrary fill color
				x += dx
			}
			return x-dx
		}
		
		let queue = [[x+1, x, y, -1]]
		
		// find fillable areas in row y, between x=left and x=right
		let find_spans = (left, right, y, dir)=>{
			if (y<0 || y>=height)
				return
			for (let x=left; x<=right; x++) {
				let stop = to_wall(x, y, +1, right)
				if (stop >= x) {
					queue.push([x, stop, y, dir])
					x = stop
				}
			}
		}
		let size = this.brush.fills.length-1
		while (queue.length) {
			let [x1, x2, y, dir] = queue.pop()
			// expand span
			let left = to_wall(x1-1, y, -1, 0)
			let right = to_wall(x2+1, y, +1, width-1)
			if (brush) {
				let path = new Path2D()
				for (let i=left; i<=right; i++)
					this.brush.add_to(path, new Point(i, y))
				this.c2d.fill(path)
			} else {
				this.c2d.fillRect(left-size, y-size, right-left+1+size*2, 1+size*2)
			}
			// check row backwards:
			if (x2<x1) {
				// (this only happens on the first iteration)
				find_spans(left, right, y-dir, -dir)
			} else {
				find_spans(left, x1-2, y-dir, -dir)
				find_spans(x2+2, right, y-dir, -dir)
			}
			// check row forwards:
			find_spans(left, right, y+dir, dir)
		}
	}
}
