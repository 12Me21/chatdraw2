const make_cursor=(size=1)=>{
	const r = size/2+1 //  3->
	const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${r*2}" height="${r*2}">
<rect x="${r-0.5}" y="${r-0.5}" width="1" height="1"/>
<rect x="${0.5}" y="${0.5}" width="${r*2-1}" height="${r*2-1}" fill="none" stroke="red" stroke-width="1"/>
</svg>
		`
	const ox = r-0.5
	const oy = r-0.5
	const url = "data:image/svg+xml;base64,"+btoa(svg)
	
	return `url("${url}") ${ox} ${oy}, crosshair`
}

let download
{
	let link = document.createElement('a')
	download = (url, filename)=>{
		link.href = url
		link.download = filename
		link.click()
	}
}

function make_pattern(str, name, context) {
	let rows = str.split("/")
	let w = rows[0].length
	let h = rows.length
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	const c2d = canvas.getContext('2d')
	const data = c2d.createImageData(w, h)
	for (let y=0; y<h; y++)
		for (let x=0; x<w; x++)
			if (rows[y][x]=="#")
				data.data[x+y*w<<2|3] = 0xFF
	c2d.putImageData(data, 0, 0)
	const pattern = context.createPattern(canvas, 'repeat')
	c2d.globalCompositeOperation = 'destination-over'
	c2d.fillStyle = '#F0E0AA'
	c2d.fillRect(0, 0, w, h)
	// hack: we want a larger canvas to use as a button label
	/*canvas.width = 7
	canvas.height = 5
	for (let y=0;y<5;y+=4)
		for (let x=-3;x<8;x+=4)
			c2d.putImageData(data, x, y)*/
	pattern._label = [canvas, name]
	canvas.style.setProperty('--pw', w)
	canvas.style.setProperty('--ph', h)
	return pattern
}

function draw_button({type='button', name, value="", label:[label, tooltip=""], title, icon=false}) {
	// hidden input element
	const input = document.createElement('input')
	Object.assign(input, {type, name, value})
	// the visible button
	const btn = document.createElement('button')
	input.title = tooltip
	if (label===true) {
		label = document.createElement('div')
		btn.classList.add('color')
		btn.style.color = `var(--color-${value})`
	} else {
		if (/^.\u{FE0F}$/u.test(label))
			icon = true
	}
	if (icon)
		btn.classList.add('icon')
	btn.append(label)
	// container element
	const cont = document.createElement('chatdraw-button')
	cont.append(input, btn)
	return cont
}

// todo: merge in that change from the failed branch where we pass actual button elements here instead of descriptors. that way we can draw the 3 types of buttons where needed and not need to deal with like  
function draw_form(choices, actions, buttons) {
	let form = document.createElement('form')
	form.autocomplete = 'off'
	form.method = 'dialog'
	form.onchange = ev=>{
		const e = ev.target
		if (e.isTrusted)
			actions[e.name]?.(e.value)
		if (e.type=='radio')
			choices[e.name].change(e.value)
	}
	form.onclick = ev=>{
		const e = ev.target
		actions[e.name]?.(e.value)
	}
	//d.form.append(document.createElement('hr'))
	for (let {title, items, size=2, cols} of buttons) {
		const fs = document.createElement('fieldset')
		let ti = document.createElement('div') //legend
		ti.append(title)
		fs.append(ti)
		for (const sb of items)
			fs.append(draw_button(sb))
		form.append(fs, document.createElement('hr'))
		if (!cols) {
			cols = Math.ceil(items.length/(8/size))
			/*fs.style.gridAutoFlow = 'column'*/
		}
		if (size==1)
			fs.classList.add('small')
		fs.style.setProperty('--cols', cols)
	}
	form.lastChild.remove()
	return form
}

// ugh we need to clean this system up.
// 1: .values should be a list of objects, containing the value, button, etc.
//  - thus: way to reference a choice by something other than index (i.e. this object)
// 2: need a way to change the value of an item that also calls onchange if it is selected
// 3: nicer way to handle drawing (pass label/tooltip together)
class Choices {
	constructor(name, values, change, label) {
		this.name = name
		this.values = values
		this.onchange = change
		this.label = label
		this.buttons = null
	}
	change(value) {
		this.onchange(this.values[value], value)
	}
	get(key) {
		return this.values[key]
	}
	bdef() {
		return this.buttons = this.values.map((x,i)=>{
			return {type: 'radio', name: this.name, value: i, label:this.label(x,i)}
		})
	}
}

class ChatDraw extends HTMLElement {
	constructor() {
		const width=200, height=100
		super()
		this.width = 200
		this.height = 100
		this.grp = new Grp(width, height)
		this.grp.canvas.classList.add('main')
		this.overlay = new Grp(width, height)
		this.overlay.canvas.classList.add('overlay')
		/// define choices ///
		this.tool = null
		this.color = 0
		/// define brushes ///
		const brushes = []
		for (let i=1; i<=3; i++)
			brushes.push(Brush.Square(i, true, [`${i}▞`, `square ${i}×${i} thin`]))
		for (let i=4; i<=8; i++)
			brushes.push(Brush.Circle(i, true, [`●${i}`, `round ${i}×${i}`]))
		for (let i=1; i<=3; i++)
			brushes.push(Brush.Square(i, false, [`${i}▛`, `square ${i}×${i} thick`]))
		brushes.push(new Brush(new Point(2.5,2.5), [
			[0,0,1,1],// wonder if we should store these as like, DOMRect?
			[1,1,1,1],
			[2,2,1,1],
			[3,3,1,1],
			[4,4,1,1],
		], 5, false, ["╲5", "a"]))
		// we can't enable diagonal on this brush, since
		// it's too thin. but technically, diagonal should work on some axes. would be nice to like, say, ok you're allowed to move in these directions:
		// [][]  
		// []()[]
		//   [][]
		// this would not be too hard to implement, either. we just pick the 2 points that straddle the line being drawn
		// (we could even do like, a dashed line? by allowing only movements of 2px at a time?)
		brushes.push(new Brush(new Point(0.5,2.5), [[0, 0, 1, 5]], 5, false, ["| 5", "a"]))
		brushes.push(new ImageBrush(new Point(0,0), null, false, ["📋", "clipboard"]))
		/// define patterns ///
		const patterns = []
		let solid = new String('black')
		solid._label = ["◼", "solid"]
		patterns.push(solid)
		// todo: ooh we can just have a text input for this format!
		for (let str of [
			"#.", "#..", "#...", // vertical lines
			"#.../..#.", // honeycomb
			"#../.#./..#", // diagonal lines
			"#.../.#../..#./...#", // diagonal lines
			"##../##../..##/..##", // big checkerboard
			// ordered dithering:
			"#.../..../..../....",
			"#.../..../..#./....",
			"#.#./..../..#./....",
			"#.#./..../#.#./....", // grid
			"#.#./.#../#.#./....",
			"#.#./.#../#.#./...#",
			"#.#./.#.#/#.#./...#",
			"#.#./.#.#/#.#./.#.#", //checker
			"###./.#.#/#.#./.#.#",
			"###./.#.#/#.##/.#.#",
			"####/.#.#/#.##/.#.#",
			"####/.#.#/####/.#.#", // grid
			"####/##.#/####/.#.#",
			"####/##.#/####/.###",
			"####/####/####/.###",
		]) {
			patterns.push(make_pattern(str, "(dither)", this.grp.c2d))
		}
		let cb = make_pattern('.', 'clipboard', this.grp.c2d)
		cb._label = ["📋", "clipboard"]
		patterns.push(cb)
		
		this.choices = {
			tool: new Choices(
				'tool', [
					Freehand, Slow,
					LineTool, Spray,
					Flood, PlaceTool,
					Mover, CopyTool,
				],
				v=>this.tool = v,
				v=>v.label
			),
			color: new Choices(
				'color', ['#000000','#FFFFFF','#FF0000','#2040EE','#00CC00','#FFFF00',COLORIZE], //["#000000","#FFFFFF","#ca2424","#7575e8","#25aa25","#ebce30"])
				(v,i)=>{
					this.color = i
					this.grp.color = v
				},
				v=>{
					if (v==COLORIZE)
						return ["📋", "source color\n(for clipboard shape/pattern)"]
					else
						return [true, v]
				}
			),
			brush: new Choices(
				'brush', brushes,
				v=>this.grp.brush = v,
				v=>v.label
			),
			pattern: new Choices(
				'pattern', patterns,
				v=>this.grp.pattern = v,
				v=>v._label
			),
			composite: new Choices(
				'composite', ['source-over', 'destination-over', 'source-atop', 'destination-out', 'xor'],
				v=>this.grp.composite = v,
				v=>({
					'source-over':["over"],
					'destination-over':["under"],
					'source-atop':["in"],
					'destination-out':["erase"],
					'destination-atop':["??"],
					'xor':["xor"],
					'copy':["copy"], // this is only useful when pasting
				}[v])
			),
		}
		/// define button actions ///
		
		// this is kinda messy why do we have to define these in 2 places...
		let actions = {
			color: i=>{
				console.log('click', i, this.color)
				if (this.color==i && i<6) {
					this.picker.value = this.choices.color.get(i)
					this.picker.click()
				}
			},
			pick: color=>{
				const sel = this.sel_color()
				if (sel < 6) {
					const old = this.choices.color.get(sel)
					this.history.add()
					this.grp.replace_color(old, color)
					this.set_palette(sel, color)
				}
			},
			reset: ()=>{
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
				if (sel>=6)
					return
				const color = this.choices.color.get(sel)
				this.history.add()
				this.grp.replace_color(color)
			},
			undo: ()=>this.history.do(false),
			redo: ()=>this.history.do(true),
			save: ()=>{
				let url = this.grp.export()
				download(url, `chatdraw-${url.match(/[/](\w{5})/)[1]}.png`)
			},
		}
		/// draw form ///
		this.form = draw_form(this.choices, actions, [
			{title:"Action", cols: 1, items:[
				{name:'undo', label:["↶","undo"], icon:true},
				{name:'redo', label:["↷","redo"], icon:true},
				{name:'fill', label:["fill","fill screen"]},
				{name:'reset', label:["reset","reset"]},
				{name:'save', label:["save"]},
			]},
			{title:"Tool", cols: 2, items:this.choices.tool.bdef()},
			{title:"Shape", size:1, items:this.choices.brush.bdef()},
			{title:"Composite", cols: 1, items:this.choices.composite.bdef()},
			{title:"Color", cols:2, items:[
				...this.choices.color.bdef(),
				/*{name:'pick', type:'color', label:["edit","edit color"]},*/
				{name:'bg', label:["➙bg","replace color with background"]},
			]},
			{title:"Pattern", size:1, items:this.choices.pattern.bdef()},
		])
		
		this.picker = document.createElement('input')
		this.picker.type = 'color'
		this.picker.className = 'picker'
		this.picker.name = 'pick'
		this.form.append(this.picker)
		
		/// undo buffer ///
		this.history = new Undo(
			50,
			()=>({
				data: this.grp.get_data(),
				palette: this.choices.color.values.slice(0, 6),
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
		
		let img = new Image(this.grp.canvas.width, this.grp.canvas.height)
		this.img = img
		this.img.oncontextmenu = ev=>{
			this.img.src = this.grp.export()
		}
		
		Stroke.handle(img, ev=>{
			if (ev.button)
				return
			this.history.add()
			this.tool.PointerDown(ev, this.grp.canvas, this.grp, this.overlay, this)
		})
		img.style.cursor = make_cursor(3)
		
		super.attachShadow({mode: 'open'})
		super.shadowRoot.append(
			...ChatDraw.styles.map(x=>document.importNode(x, true)),
			img, this.grp.canvas, this.overlay.canvas,
			this.form
		)
		
		this.choose('tool', 0)
		this.choose('brush', 1)
		this.choose('composite', 0)
		this.choose('color', 0)
		this.choose('pattern', 0)
	}
	// idea: what if all tools just draw to the overlay, then we copy to main canvas at the end of the stroke? and update undo buffer..
	// ugh but that would be slow maybe?
	
	connectedCallback() {
		super.style.setProperty('--width', this.width)
		super.style.setProperty('--height', this.height)
	}
	
	when_copy(data) {
		let c = document.createElement('canvas')
		c.width = data.width
		c.height = data.height
		let c2d = c.getContext('2d')
		c2d.putImageData(data, 0, 0)
		this.clipboard = c
		
		this.choose('tool', 5) // prevent accidental overwriting
		
		// URGENT TODO: setting values like this wont update the current value if its already selected
		// todo: better way of setting these that doesnt rely on hardcoded button location index?
		let pv = this.choices.pattern.values
		pv[pv.length-1] = this.grp.c2d.createPattern(c, 'repeat')
		
		let bv = this.choices.brush.values, bl = bv.length-1
		bv[bl].set_image(c)
		this.choose('brush', bl)
	}
	
	set_scale(n) {
		this.style.setProperty('--S', n)
	}
	// todo: allow passing a more useful value here
	choose(name, value) {
		let elem = this.form.querySelector(`input[name="${name}"][value="${value}"]`)
		elem.checked = true
		elem.dispatchEvent(new Event('change', {bubbles:true}))
	}
	set_palette2(colors) {
		for (let i=0; i<6; i++)
			this.set_palette(i, colors[i])
	}
	set_palette(i, color) {
		this.form.style.setProperty(`--color-${i}`, color)
		this.choices.color.values[i] = color
		if (i==this.sel_color())
			this.choices.color.change(i)
		// hack
		let btn = i<6 && this.form?.querySelector(`input[name="color"][value="${i}"]`)
		if (btn)
			btn.title = color
	}
	// which color index is selected
	sel_color() {
		return this.color
	}
}
ChatDraw.styles = ['style.css', 'deco.css'].map(href=>Object.assign(document.createElement('link'), {rel:'stylesheet', href}))

customElements.define('chat-draw', ChatDraw)
