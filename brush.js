"use strict"

class Point extends DOMPointReadOnly {
	distance(p) {
		return Math.hypot(this.x-p.x, this.y-p.y)
	}
	magnitude() {
		return Math.hypot(this.x, this.y)
	}
	max_distance(p) { //todo: what was this actually called?
		return Math.max(this.x-p.x, this.y-p.y)
	}
	axis_diff() {
		return Math.abs(this.x - this.y)
	}
	// not a real measurement, only useful for comparing points' distances from the same line
	ldist(start, end) {
		return end.Subtract(start).RMultiply(start.Subtract(this)).axis_diff()
	}
	
	Divide(p) {
		return new Point(this.x/p.x, this.y/p.y)
	}
	RMultiply(p) { // name?
		return new Point(this.x*p.y, this.y*p.x)
	}
	SwapAxes() {
		return new Point(this.y, this.x)
	}
	Add(p) {
		return new Point(this.x+p.x, this.y+p.y)
	}
	Subtract(p) {
		return new Point(this.x-p.x, this.y-p.y)
	}
	Multiply(p) {
		return new Point(this.x*p.x, this.y*p.y)
	}
	Lerp(p, t) {
		return new Point(this.x*(1-t)+p.x*t, this.y*(1-t)+p.y*t)
	}
	Floor() {
		return new Point(Math.floor(this.x), Math.floor(this.y))
	}
	Round() {
		return new Point(Math.round(this.x), Math.round(this.y))
	}
	Cursor_adjust(brush) {
		return this.Subtract(brush.origin).Round().Add(brush.origin)
	}
	Signs() {
		return new Point(Math.sign(this.x), Math.sign(this.y))
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
		d.draw_line(old, pos)
	}
	end(d, pos) {
		d.draw(pos)
	}
}

class Spray extends Tool {
	start(d, pos) {
		this.drag(d,pos)
		//d.random_in_brush(pos)
	}
	drag(d, pos, old) {
		for (let i=0;i<10;i++)
			d.random_in_brush(pos)
	}
	end(d, pos) {
		this.drag(d,pos)
	}
}

class LineTool extends Tool {
	constructor() {
		super()
		this.old = new Point()
	}
	start(d, pos) {
		this.old = pos
	}
	drag(d, pos, old) {
	}
	end(d, pos) {
		d.draw_line(this.old, pos)
	}
}

class Slow extends Tool {
	constructor() {
		super()
		this.speed = 0.15
		this.avg = new Point()
	}
	start(d, pos) {
		this.avg = pos
	}
	drag(d, pos, old) {
		pos = this.avg.Lerp(pos, this.speed)
		d.draw_line(this.avg, pos)
		this.avg = pos
	}
	end(d, pos) {
		this.drag(d, pos, pos)
	}
}


class Brush extends Path2D {
	constructor(origin, fills) {
		super()
		for (let f of fills)
			this.rect(...f)
		this.origin = origin
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
		this.set_composite('source-over')
		this.c2d.shadowOffsetX = 1000
		this.c2d.shadowOffsetY = 0
		this.c2d.translate(-1000, 0)
		
		this.history_max = 20
		this.history_reset()
		
		this.clear(true)
		
		this.set_tool(new Freehand())
		
		this.set_brush(new Brush(new Point(1, 1), [
			[0, 0, 2, 2],
		]))//new Path2D('M-100,0 m-1-1 h2 v2 h-2 z'))
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
		this.canvas.onpointerup = ev=>{
			let old = this.pointers.get(ev.pointerId)
			if (!old)
				return
			let pos = this.event_pos(ev)
			this.tool.end(this, pos, old)
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
	
	//'source-over' - replace
	//'destination-over' - draw behind
	//'source-atop' - draw on existing colors
	set_composite(mode) {
		this.c2d.globalCompositeOperation = mode
	}
	
	// tools
	set_tool(tool) {
		this.tool = tool
	}
	
	// event handling
	canvas_scale() {
		let csizeP = Point.FromRect(this.canvas.getBoundingClientRect())
		let cdimP = Point.FromRect(this.canvas)
		return csizeP.Divide(cdimP)
	}
	
	event_pos(ev) {
		let scaleP = this.canvas_scale()
		
		let ps = 1/window.devicePixelRatio/2
		let adjustP = new Point(ps, ps).Divide(scaleP)
		
		return new Point(ev.offsetX, ev.offsetY).Add(adjustP).Divide(scaleP)
	}
	
	// undo/redo
	history_get() {
		return this.c2d.getImageData(0, 0, this.canvas.width, this.canvas.height)
	}
	history_set(data) {
		this.c2d.save()
		this.c2d.resetTransform()
		this.c2d.globalCompositeOperation = 'copy'
		this.c2d.putImageData(data, 0, 0)
		this.c2d.restore()
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
	clear(all) {
		this.history_add()
		this.c2d.save()
		if (all) {
			this.c2d.resetTransform()
			this.c2d.globalCompositeOperation = 'copy'
			this.c2d.fillStyle = 'transparent'
			this.c2d.shadowColor = 'transparent'
		}
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
	
	add_brush(path, pos) {
		let {x,y} = pos.Subtract(this.brush.origin).Round()
		path.addPath(this.brush, new DOMMatrixReadOnly([1,0,0,1,x,y]))
	}
	draw(pos) {
		let path = new Path2D()
		this.add_brush(path, pos)
		this.c2d.fill(path)
		//let {origin, fills} = this.brush
		//let {x,y} = pos.Subtract(origin).Round()
		//fills.forEach(([s,t,w,h])=>this.c2d.fillRect(x+s,y+t,w,h))
	}
	draw_line(start, end) {
		// steps
		let diff = end.Subtract(start)
		let step_h = new Point(Math.sign(diff.x), 0)
		let step_v = new Point(0, Math.sign(diff.y))
		//
		let pos = start.Cursor_adjust(this.brush)
		let i
		let path = new Path2D()
		for (i=0; i<500; i++) {
			this.add_brush(path, pos)
			
			let rem = pos.Subtract(end)
			if (Math.abs(rem.x)<=0.5 && Math.abs(rem.y)<=0.5)
				break
			
			// move in the direction that takes us closest to the ideal line
			let horiz = pos.Add(step_h)
			let vert = pos.Add(step_v)
			
			if (step_h.x && horiz.ldist(start, end)<=vert.ldist(start, end))
				pos = horiz
			else
				pos = vert
		}
		if (i>400)
			console.log('failed', start,end,pos,stop)
		this.add_brush(path, end)
		this.c2d.fill(path)
	}
	random_in_brush(pos) {
		let r
		let n = 0
		do {
			n++
			if (n>30)
				return
			r = new Point(Math.random()*10-5, Math.random()*10-5)
			r = r.Cursor_adjust(this.brush).Add(this.brush.origin)
		} while (!this.c2d.isPointInPath(this.brush, r.x+.5-1000, r.y+.5))
		pos = pos.Add(r).Subtract(this.brush.origin)
		this.c2d.fillRect(pos.x, pos.y, 1, 1)
	}
	erase_color(color) {
		this.history_add()
		this.c2d.save()
		this.c2d.resetTransform()
		this.c2d.globalCompositeOperation = 'copy'
		let w = this.canvas.width
		let data = this.c2d.getImageData(0, 0, w, this.canvas.height)
		let d = data.data
		let c = [
			parseInt(color.substr(1,2), 16),
			parseInt(color.substr(3,2), 16),
			parseInt(color.substr(5,2), 16),
			255,
		]
		p: for (let i=0; i<d.length; i+=4) {
			for (let j=0; j<4; j++) {
				if (d[i+j] != c[j])
					continue p
			}
			d.fill(0, i, i+4)
		}
		this.c2d.putImageData(data, 0, 0)
		this.c2d.restore()
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
		c2d.putImageData(data, 0, 0)
		let pattern = this.c2d.createPattern(canvas, 'repeat')
		return [pattern, canvas]
	}
}


function draw_button(arg) {
	for (let type in arg) {
		let input = document.createElement('input')
		let name = arg[type]
		Object.assign(input, {type, name, value:arg.value})
		let span = document.createElement('b')
		span.append(arg.text)
		if (arg.text[0] > '~' || arg.icon)
			span.classList.add('icon')
		if (name=='color')
			span.style.color = arg.value
		let label = document.createElement('label')
		label.append(input, span)
		return label
	}
}

class ChatDraw extends HTMLElement {
	constructor() {
		super()
		super.attachShadow({mode: 'open'})
		let d = this.draw = new Drawer(200, 100)
		
		let patterns = []
		for (let i=0; i<16; i++)
			patterns[i] = d.dither_pattern(i)
		let brushes = []
		for (let d=1; d<=8; d++)
			brushes.push(new CircleBrush(d))
		let tools = {
			pen: new Freehand(),
			slow: new Slow(),
			line: new LineTool(),
			spray: new Spray(),
		}
		
		let form = document.createElement('form')
		form.autocomplete = 'off'
		form.method = 'dialog'
		
		let buttons = [
			{items:[
				{button:'clear', text:"reset"},
				{button:'undo', text:"↶"},
				{button:'redo', text:"↷"},
				{button:'fill', text:"!fill"},
				{button:'bg', text:"!color ➙bg"},
				...Object.keys(tools).map(k=>{
					return {radio:'tool', text:k, value:k}
				}),
			]},
			{items:[
				{radio:'comp', text:"all", value:'source-over'},
				{radio:'comp', text:"below", value:'destination-over'},
				{radio:'comp', text:"in", value:'source-atop'},
				{radio:'comp', text:"erase", value:'destination-out'},
			]},
			
			{items:['#000000','#FFFFFF','#FF0000','#0000FF'].map(x=>({
				radio:'color', text:"■", value:x,
			}))},
			//{color:'pick', text:"■"},
			{items:brushes.map((b,i)=>{
				return {radio:'brush', text:""+(i+1), value:i, icon:true}
			}),size:1},
			{items:patterns.map((b,i)=>{
				return {radio:'pattern', text:b[1], value:i}
			}),size:1,flow:'column'},
		]
		for (let {items,size=2,flow} of buttons) {
			let fs = document.createElement('div')
			for (let sb of items) {
				fs.append(draw_button(sb))
			}
			form.append(fs)
			fs.style.gridTemplateColumns = `repeat(${Math.ceil(items.length/(8/size))}, 1fr)`
			fs.style.gridTemplateRows = `repeat(${Math.ceil(8/size)}, 1fr)`
			if (size)
				fs.style.setProperty('--scale', size)
			if (flow)
				fs.style.gridAutoFlow = flow
		}
		
		let actions = {
			color: v=>d.set_color(v),
			comp: v=>d.set_composite(v),
			pattern: v=>d.set_pattern(patterns[+v][0]),
			brush: v=>d.set_brush(brushes[+v]),
			tool: v=>d.set_tool(tools[v]),
			
			clear: ()=>d.clear(true),
			fill: ()=>d.clear(false),
			bg: ()=>d.erase_color(this.form.color.value),
			undo: ()=>d.history_do(false),
			redo: ()=>d.history_do(true),
		}
		
		form.onchange = ev=>{
			let e = ev.target
			if (e.type=='radio')
				actions[e.name](e.value)
		}
		
		form.onclick = ev=>{
			let e = ev.target
			if (e.type=='button')
				actions[e.name]()
		}
		
		d.history_onchange = ()=>{
			form.undo.disabled = !d.history[0].length
			form.redo.disabled = !d.history[1].length
		}
		d.history_onchange()
		
		form.brush.value = 1
		form.tool.value = "pen"
		form.comp.value = "source-over"
		form.color.value = "#000000"
		form.pattern.value = 15
		
		super.shadowRoot.append(document.importNode(ChatDraw.style, true), d.canvas, form)
	}
}
ChatDraw.style = document.createElement('style')
ChatDraw.style.textContent = `
:host {
	display: inline-grid !important;
	grid-template:
		"canvas" max-content
		"gap" 1px
		"controls" auto
		/ min-content;
	padding: 1px;
	--scale: 2;
	background: silver;
}
:host > canvas {
	grid-area: canvas;
	width: calc(var(--width) * 1px * var(--scale, 1));
	cursor: crosshair;
}
canvas {
	image-rendering: -moz-crisp-edges; image-rendering: pixelated;
	background: repeating-linear-gradient(12.23deg, #F0E0AA, #D8D0A8 0.38291px);
}
form {
	grid-area: controls;
	display: flex;
	flex-flow: column-wrap;
	-webkit-user-select: none; -moz-user-select: none; user-select: none;
	padding: calc(var(--scale) * 3px) 0;
	justify-content: space-around;
}
label {
	display: contents;
}
input {
	display: none;
}
b {
	box-sizing: border-box;
	width: calc(var(--scale) * 25px);
	height: calc(var(--scale) * 15px);
	
	border: solid calc(var(--scale) * 2px);
	border-color: #FFF #888 #666 #DDD;
	border-radius: calc(var(--scale) * 8px);

	display: grid;
	align-content: center;
	justify-content: center;
	text-align: center;
	line-height: 1;
	font-size: calc(var(--scale) * 6px);

	background: #BBB;
	color: #444;
}
b:hover {
	background: #DDD;
}

:checked + b {
	border-color: #777 #555 #555 #777;
	box-shadow: 0 0 10px 0px inset black;
	color: #FFFF00A0;
	text-shadow: 0 0 1px red;
	background: #888;
	border-style: none;
}
input:disabled + b {
	border-color: #999;
	color: #666;
	background: #2929291A;
}
input[type="button"]:not(:disabled) + b:hover {
	border-color: #CCC;
	text-shadow: 0 0 1px yellow;
}
b.icon {
	font-weight: normal;
	font-size: calc(var(--scale) * 10px);
}
div {
	display: grid;
	align-content: start;
	grid-auto-flow: row;
}
b > canvas {
	width: calc(var(--scale) * 8px);
}
`

customElements.define('chat-draw', ChatDraw)

let make_cursor=(size=1)=>{
	let r = size/2+1 //  3->
	let svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${r*2}" height="${r*2}">
<rect x="${r-0.5}" y="${r-0.5}" width="1" height="1"/>
<rect x="${0.5}" y="${0.5}" width="${r*2-1}" height="${r*2-1}" fill="none" stroke="red" stroke-width="1"/>
</svg>
		`
	let ox = r-0.5
	let oy = r-0.5
	let url = "data:image/svg+xml;base64,"+btoa(svg)
	
	chatdraw.canvas.style.cursor = `url("${url}") ${ox} ${oy}, crosshair`
}
