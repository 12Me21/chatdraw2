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
	const link = document.createElement('a')
	download = (url, filename)=>{
		link.href = url
		link.download = filename
		link.click()
	}
}

function make_pattern(str, name, context) {
	const rows = str.split("/")
	const w = rows[0].length
	const h = rows.length
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
	c2d.fillStyle = '#f0e0aa'
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

// todo: merge in that change from the failed branch where we pass actual button elements here instead of descriptors. that way we can draw the 3 types of buttons where needed and not need to deal with like  

// also: i would like to put the "actions" block horizontally, either above or below the tools (and maybe patterns too?) idk. do feel like the FILL button doesnt belong there. technically it should be a brush but thats silly. could probably just remove reset though, idk. nice to have. for like, need a blank canvas temporarily, reset then undo>
function draw_form(choices, actions, sections) {
	function draw_button({type='button', name, value="", label:[label, title="", icon=false]}) {
		// hidden input element
		const input = document.createElement('input')
		Object.assign(input, {type, name, value, title})
		// the visible button
		const btn = document.createElement('button')
		if (icon)
			btn.classList.add('icon')
		btn.append(label)
		const cont = document.createElement('chatdraw-button')
		cont.append(input, btn)
		return cont
	}
	
	const form = document.createElement('form')
	form.autocomplete = 'off'
	form.method = 'dialog'
	form.onchange = ev=>{
		const e = ev.target
		if (ev.isTrusted)
			actions[e.name]?.(e.value, e)
		if (e.type=='radio')
			choices[e.name].change(e.value)
	}
	form.onclick = ev=>{
		const e = ev.target
		if (e.type=='button' || e.type=='radio')
			actions[e.name]?.(e.value)
	}
	//
	for (let {title, items, cols, small=false} of sections) {
		// legend
		const label = document.createElement('div')
		label.append(title)
		
		const sect = document.createElement('fieldset')
		sect.append(label)
		// buttons
		for (const sb of items)
			sect.append(draw_button(sb))
		// grid
		// todo: clean up the rows cols thing
		if (small)
			sect.classList.add('small')
		if (!cols) {
			cols = Math.ceil(items.length/(small ? 8 : 4))
			/*sect.style.gridAutoFlow = 'column'*/
		}
		sect.style.setProperty('--cols', cols)
		
		form.append(sect, document.createElement('hr'))
	}
	form.lastChild.remove() // last hr
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
		this.buttons = this.values.map((x,i)=>{
			return {type:'radio', name:this.name, value:i, label:this.label(x,i)}
		})
	}
	change(i) {
		this.onchange(this.values[i], i)
	}
}

class ChatDraw extends HTMLElement {
	width = 200
	height = 100
	palsize = 6
	
	grp = new Grp(this.width, this.height)
	overlay = new Grp(this.width, this.height)
	img = new Image(this.width, this.height)
	form = null
	choices = null
	
	history = null
	tool = null
	color = 0
	clipboard = null
	
	constructor() {
		super()
		Object.seal(this)
		
		this.grp.canvas.classList.add('main')
		this.overlay.canvas.classList.add('overlay')
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
		brushes.push(new ImageBrush(new Point(0,0), null, false, false, ["📋", "clipboard"]))
		brushes.push(new ImageBrush(new Point(0,0), null, true, false, ["📋", "clipboard (colorized)"]))
		/// define patterns ///
		const patterns = []
		const solid = new String('black')
		solid._label = ["◼", "solid"]
		patterns.push(solid)
		// todo: ooh we can just have a text input for this format!
		for (const str of [
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
		const cb = make_pattern('.', 'clipboard', this.grp.c2d)
		cb._label = ["📋", "clipboard"]
		patterns.push(cb)
		
		this.choices = {
			tool: new Choices(
				'tool', [
					tools.Pen, tools.Slow, tools.Line, tools.Spray,
					tools.Flood, tools.Place, tools.Move, tools.Copy,
				],
				v=>this.tool = v,
				v=>v.label
			),
			color: new Choices(
				'color', ['#000000','#ffffff','#ff0000','#2040ee','#00cc00','#ffff00'], //"#000000","#FFFFFF","#ca2424","#7575e8","#25aa25","#ebce30"
				(v,i)=>{
					this.color = i
					this.grp.color = v
					this.form.pick.value = v
				},
				(v,i)=>{
					const label = document.createElement('div')
					label.style.color = `var(--color-${i})`
					return [label, v]
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
				// messy, we need to have a nicer way to like, keep track of the labels idk.. associate with values etc,
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
		
		const pick_color = (picked)=>{
			let sel = this.sel_color()
			const old = this.choices.color.values[sel]
			this.history.add()
			this.grp.replace_color(old, picked)
			this.set_palette(sel, picked)
		}
		// safari hack
		let picked = null
		const safari = navigator.vendor=="Apple Computer, Inc."
		
		/// define button actions ///
		// this is kinda messy why do we have to define these in 2 places..
		const actions = {
			pick: color=>{
				if (safari)
					picked = color
				else
					pick_color(color)
			},
			color: i=>{
				//if (this.color==i && i<this.palsize)
				//	this.form.pick.click() // showPicker()?
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
				if (sel<this.palsize) {
					const color = this.choices.color.values[sel]
					this.history.add()
					this.grp.replace_color(color)
				}
			},
			undo: ()=>this.history.do(false),
			redo: ()=>this.history.do(true),
			save: ()=>{
				const url = this.grp.export()
				download(url, `chatdraw-${url.match(/[/](\w{5})/)[1]}.png`)
			},
			load: async (v,e)=>{
				let file = e.files[0]
				if (!file)
					return
				let url = URL.createObjectURL(file)
				try {
					let img = new Image()
					img.src = url
					await img.decode()
					this.history.add()
					this.import(img)
				} finally {
					URL.revokeObjectURL(url)
				}
			},
		}
		
		// todo: put this.img somewhere?
		this.img.oncontextmenu = ev=>{
			this.img.src = this.grp.export()
		}
		
		/// draw form ///
		this.form = draw_form(this.choices, actions, [
			{title:"Action", cols: 1, items:[
				{name:'undo', label:["↶","undo",true]},
				{name:'redo', label:["↷","redo",true]},
				{name:'reset', label:["reset","reset"]},
				{name:'save', label:["save", "save"]},
				{name:'load', type:'file', label:["load"]},
			]},
			{title:"Tool", cols: 2, items:[
				...this.choices.tool.buttons,
				{name:'fill', label:["fill","fill screen"]},
			]},
			{title:"Shape", small:true, items:this.choices.brush.buttons},
			{title:"Composite", cols: 1, items:this.choices.composite.buttons},
			{title:"Color", cols:2, items:[
				...this.choices.color.buttons,
				{name:'pick', type:'color', label:["edit","edit color"]},
				{name:'bg', label:["➙bg","replace color with background"]},
			]},
			{title:"Pattern", small:true, items:this.choices.pattern.buttons},
		])
		
		if (safari)
			this.form.pick.onblur = this.form.pick.onfocus = ev=>{
				if (picked)
					pick_color(picked)
				picked = null
			}
		
		/// undo buffer ///
		this.history = new Undo(
			50,
			()=>({
				data: this.grp.get_data(),
				palette: this.choices.color.values.slice(0, this.palsize),
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
		
		let c = document.createElement('div')
		c.style.setProperty('--width', this.width)
		c.style.setProperty('--height', this.height)
		c.append(this.grp.canvas, this.overlay.canvas)
		c.style.cursor = make_cursor(3)
		
		Stroke.handle(c, ev=>{
			if (ev.button)
				return
			this.history.add()
			this.tool.PointerDown(ev, this.grp.canvas, this.grp, this.overlay, this)
		})
		
		super.attachShadow({mode: 'open'}).append(
			...ChatDraw.styles.map(x=>document.importNode(x, true)),
			c, this.form
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
	}
	
	when_copy(data) {
		const c = document.createElement('canvas')
		c.width = data.width
		c.height = data.height
		const c2d = c.getContext('2d')
		c2d.putImageData(data, 0, 0)
		this.clipboard = c
		
		this.choose('tool', 5) // prevent accidental overwriting
		
		// URGENT TODO: setting values like this wont update the current value if its already selected
		// todo: better way of setting these that doesnt rely on hardcoded button location index?
		const pv = this.choices.pattern.values
		pv[pv.length-1] = this.grp.c2d.createPattern(c, 'repeat')
		
		const bv = this.choices.brush.values, bl = bv.length-1
		bv[bl].set_image(c)
		bv[bl-1].set_image(c)
		this.choose('brush', bl-1)
	}
	
	set_scale(n) {
		this.style.setProperty('--S', n)
	}
	// todo: allow passing a more useful value here
	choose(name, value) {
		const elem = this.form.querySelector(`input[name="${name}"][value="${value}"]`)
		elem.checked = true
		elem.dispatchEvent(new Event('change', {bubbles:true}))
	}
	set_palette2(colors) {
		for (let i=0; i<this.palsize; i++)
			this.set_palette(i, colors[i]??"#b4b4b4")
	}
	set_palette(i, color) {
		if (i>=this.palsize)
			return
		this.form.style.setProperty(`--color-${i}`, color)
		this.choices.color.values[i] = color
		if (i==this.sel_color())
			this.choices.color.change(i)
		// hack
		const btn = this.form?.querySelector(`input[name="color"][value="${i}"]`)
		if (btn)
			btn.title = color
	}
	// which color index is selected
	sel_color() {
		return this.color
	}
	
	import(img) {
		this.grp.c2d.drawImage(img, 1000, 0, this.width, this.height)
		this.grp.replace_color('#e4d8a9', null)
		this.set_palette2(this.grp.get_palette(this.palsize))
	}
}
ChatDraw.styles = ['style.css'].map(href=>Object.assign(document.createElement('link'), {rel:'stylesheet', href}))

customElements.define('chat-draw', ChatDraw)
