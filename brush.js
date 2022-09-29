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
	Lerp(p, t) {
		return new Point(this.x*(1-t)+p.x*t, this.y*(1-t)+p.y*t)
	}
	
	c_dist(p) { return Math.max(Math.abs(this.x-p.x), Math.abs(this.y-p.y)) }
	
	* follow_line(start, end) {
		let diff = end.Subtract(start)
		let step_h = new Point(Math.sign(diff.x), 0)
		let step_v = new Point(0, Math.sign(diff.y))
		for (let pos=this,step=step_v; pos.c_dist(end)>0.5; pos=pos.Add(step)) {
			yield pos
			// choose step that takes us closest to the ideal line
			if (step_h.x) {
				let c = diff.x*(pos.y-start.y) - diff.y*(pos.x-start.x)
				let horz = Math.abs(c - step_h.x*diff.y)
				let vert = Math.abs(c + step_v.y*diff.x)
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

class Tool {
	down(){}
	move(){}
	up(){}
}

class Freehand extends Tool {
	down(d, pos) {
		d.draw(pos)
	}
	move(d, pos, old) {
		d.draw_line(old, pos)
	}
}
Freehand.prototype.name = 'pen'

class Spray extends Tool {
	down(d, pos) {
		this.move(d, pos)
	}
	move(d, pos, old) {
		for (let i=0;i<10;i++)
			d.random_in_brush(pos)
	}
}
Spray.prototype.name = 'spray'

class LineTool extends Tool {
	constructor() {
		super()
		this.old = new Point()
	}
	down(d, pos) {
		this.old = pos
	}
	up(d, pos) {
		d.draw_line(this.old, pos)
	}
}
LineTool.prototype.name = 'line'

class Slow extends Tool {
	constructor() {
		super()
		this.speed = 0.15
		this.avg = new Point()
	}
	down(d, pos) {
		this.avg = pos
	}
	move(d, pos) {
		pos = this.avg.Lerp(pos, this.speed)
		d.draw_line(this.avg, pos)
		this.avg = pos
	}
	up(d, pos) {
		this.move(d, pos)
	}
}
Slow.prototype.name = 'slow'


class Brush extends Path2D {
	constructor(origin, fills) {
		super()
		for (let f of fills)
			super.rect(...f)
		this.origin = origin
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
		for (let pos of this.adjust_cursor(start).follow_line(start, end)) {
			if (i++>400)
				throw new Error(`Infinite loop when drawing line:\nfrom ${start} to ${end}.`)
			this.add_to(path, pos)
		}
		return path
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
		this.c2d.shadowOffsetX = 1000
		this.c2d.translate(-1000, 0)
		
		this.form = document.createElement('form')
		this.form.autocomplete = 'off'
		this.form.method = 'dialog'
		
		this.history_max = 20
		//this.history_reset()
		//this.clear(true)
		
		this.choices = {
			tool: new Choices('tool', [
				new Freehand(),
				new Slow(),
				new LineTool(),
				new Spray(),
			], v=>{
				this.tool = v
			}, v=>v.name),
			color: new Choices('color', [
			], v=>{
				this.form.pick.value = v
				this.c2d.shadowColor = v
			}, v=>""),
			brush: new Choices('brush', [
			], v=>{
				this.brush = v
			}, (v,i)=>`${i+1}`),
			pattern: new Choices('pattern', [
			], v=>{
				this.c2d.fillStyle = v
			}, null),
			comp: new Choices('comp', [
				'source-over',
				'destination-over',
				'source-atop',
				'destination-out',
			], v=>{
				this.c2d.globalCompositeOperation = v
			}, v=>{
				return {
					'source-over':"all",
					'destination-over':"under",
					'source-atop':"in",
					'destination-out':"erase"
				}[v]
			}),
		}
		this.set_palette2(['#000000','#FFFFFF','#FF0000','#0000FF','#00FF00','#FFFF00'])
		
		let sel_color=()=>this.form.color.value
		
		this.actions = {
			pick: color=>{
				let sel = sel_color()
				let old = this.choices.color.get(sel)
				this.replace_color(old, color)
				this.set_palette(sel, color)
				this.choices.color.change(sel)
			},
			
			clear: ()=>this.clear(true),
			fill: ()=>this.clear(false),
			bg: ()=>{
				let color = this.choices.color.get(sel_color())
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
		this.pointers = new Map()
		this.canvas.onpointerdown = ev=>{
			ev.target.setPointerCapture(ev.pointerId)
			this.history_add()
			this.pointers.set(ev.pointerId, {old: null})
			this.do_tool(ev)
		}
		this.canvas.onpointermove = this.canvas.onpointerup = ev=>{
			this.do_tool(ev)
		}
		this.canvas.onlostpointercapture = ev=>{
			this.pointers.delete(ev.pointerId)
		}
	}
	
	//////////////////////
	/// event handling ///
	//////////////////////
	do_tool(ev) {
		let ptr = this.pointers.get(ev.pointerId)
		if (!ptr)
			return
		let pos = this.event_pos(ev)
		let old = ptr.old
		ptr.old = pos
		this.tool[ev.type.slice(7)](this, pos, old)
	}
	event_pos(ev) {
		let scale = Point.FromRect(this.canvas.getBoundingClientRect()).Divide(Point.FromRect(this.canvas))
		
		let ps = 1/window.devicePixelRatio/2
		let adjust = new Point(ps, ps).Divide(scale)
		
		return new Point(ev.offsetX, ev.offsetY).Add(adjust).Divide(scale)
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
		this.c2d.fill(this.brush.line(start, end))
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
	
	dither_pattern(level) {
		const od = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
		let canvas = document.createElement('canvas')
		canvas.width = 4
		canvas.height = 4
		let c2d = canvas.getContext('2d')
		let data = c2d.createImageData(4, 4)
		for (let x=0; x<16; x++)
			if (od[x] <= level)
				data.data[x<<2|3] = 0xFF
		// hack: we want a larger canvas to use as a button label
		c2d.putImageData(data, 0, 0)
		let pattern = this.c2d.createPattern(canvas, 'repeat')
		canvas.width = 8
		canvas.height = 5
		for (let y=0;y<5;y+=4)
			for (let x=-3;x<8;x+=4)
				c2d.putImageData(data, x, y)
		return [pattern, canvas]
	}
}
