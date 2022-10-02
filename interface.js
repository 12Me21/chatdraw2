// todo: can we just restyle the normal ones instead? why are we doing it this way?
function draw_button({type, name, value="", text, icon}) {
	let input = document.createElement('input')
	Object.assign(input, {type, name, value})
	let span = document.createElement('b')
	let s = document.createElement('span')
	s.append(text)
	span.append(s)
	if (icon)
		span.classList.add('icon')
	if (name=='color') {
		span.classList.add('color')
		span.style.color = `var(--color-${value})`
	}
	let label = document.createElement('label')
	label.tabIndex = 0
	label.append(input, span)
	return label
}

function dither_pattern(level, context, offset=0) {
	const od = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
	let canvas = document.createElement('canvas')
	canvas.width = 4
	canvas.height = 4
	let c2d = canvas.getContext('2d')
	let data = c2d.createImageData(4, 4)
	for (let x=0; x<16; x++)
		if (od[x+offset & 15] <= level)
			data.data[x<<2|3] = 0xFF
	// hack: we want a larger canvas to use as a button label
	c2d.putImageData(data, 0, 0)
	let pattern = context.createPattern(canvas, 'repeat')
	canvas.width = 7
	canvas.height = 5
	for (let y=0;y<5;y+=4)
		for (let x=-3;x<8;x+=4)
			c2d.putImageData(data, x, y)
	return [pattern, canvas]
}

class ChatDraw extends HTMLElement {
	constructor() {
		super()
		super.attachShadow({mode: 'open'})
		
		let d = this.draw = new Drawer(200, 100)
		
		for (let i=1; i<=8; i++)
			d.choices.brush.values.push(new CircleBrush(i))
		
		let pl = []
		// ew. just pass like, a 16 bit number and hardcode the list idk.
		// maybe we want an input for specifying the pattern transform x/y. not sure how to design this though. numeric inputs kinda suck.
		// maybe have up/down/left/right shift buttons
		// and show the patterns on the buttons in their absolute positions?
		// also we should show a preview of the current brush on the overlay layer.
		for (let i=0; i<16; i++)
			0,[d.choices.pattern.values[i], pl[i]] = dither_pattern(i, d.c2d)
		0,[d.choices.pattern.values[16], pl[16]] = dither_pattern(7, d.c2d, 2)
		0,[d.choices.pattern.values[17], pl[17]] = dither_pattern(3, d.c2d, 4)
		0,[d.choices.pattern.values[18], pl[18]] = dither_pattern(3, d.c2d, 6)
		0,[d.choices.pattern.values[19], pl[19]] = dither_pattern(3, d.c2d, 12)
		d.choices.pattern.label = (v,i)=>pl[i]
		
		//d.set_palette2(['#000000','#FFFFFF','#FF0000','#0000FF','#00FF00','#FFFF00'])
		d.set_palette2(["#000000","#FFFFFF","#ca2424","#7575e8","#25aa25","#ebce30"])
		
		let buttons = [
			{title:'Draw Mode', items:d.choices.comp.bdef()},
			{title:'Tools', cols:3, items:[
				{type:'button', name:'clear', text:"reset!"},
				{type:'button', name:'undo', text:"↶", icon:true},
				{type:'button', name:'redo', text:"↷", icon:true},
				{type:'button', name:'fill', text:"fill"},
				...d.choices.tool.bdef(),
			]},
			// maybe swap the following 2 so color is more central?
			{title:"Brushes", size:1, items:d.choices.brush.bdef()},
			{title:"Patterns", size:1, flow:'column', items:d.choices.pattern.bdef()},
			{title:"Colors", cols:2, items:[
				{type:'color', name:'pick', text:"edit"},
				{type:'button', name:'bg', text:"➙bg"},
				...d.choices.color.bdef(),
			]},
		]
		//d.form.append(document.createElement('hr'))
		for (let {title, items, size=2, flow, cols} of buttons) {
			let fs = document.createElement('div')
			let x = document.createElement('div')
			x.append(title)
			fs.append(x)
			for (let sb of items)
				fs.append(draw_button(sb))
			d.form.append(fs, document.createElement('hr'))
			if (!cols)
				cols = Math.ceil(items.length/(8/size))
			fs.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
			fs.style.gridTemplateRows = `auto repeat(${Math.ceil(8/size)}, 1fr)`
			fs.style.fontSize = `calc(${size/2}px * var(--scale))`
			if (flow)
				fs.style.gridAutoFlow = flow
		}
		d.form.lastChild.remove()
		
		super.shadowRoot.append(document.importNode(ChatDraw.style, true), d.canvas, d.form)
		
		d.choose('tool', 0)
		d.choose('brush', 1)
		d.choose('comp', 0)
		d.choose('color', 0)
		d.choose('pattern', 15)
		
		d.history_reset()
		d.clear(true)
		
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
			
			this.draw.canvas.style.cursor = `url("${url}") ${ox} ${oy}, crosshair`
		}
		make_cursor(3)
		
	}
	set_scale(n) {
		this.style.setProperty('--scale', n)
	}
}
ChatDraw.style = document.createElement('style')
ChatDraw.style.textContent = `
* {
	contain: content;
}
:host {
	display: inline-grid !important;
	grid-template:
		"canvas" max-content
		"controls" auto
		/ min-content;
	--scale: 2;
	border: solid calc(var(--scale) * 2px);
	border-color: #998 #887 #666 #887;
	background: #B0B098;
}
:host > canvas {
	grid-area: canvas;
	width: calc(var(--width) * 1px * var(--scale, 1));
	cursor: crosshair;
	touch-action: none;
}
canvas {
	image-rendering: -moz-crisp-edges; image-rendering: pixelated;
	background: repeating-linear-gradient(1.23deg, #F0E0AA, #D8D0A8 0.38291px);
}
form {
	grid-area: controls;
	display: flex;
	-webkit-user-select: none; -moz-user-select: none; user-select: none;
	justify-content: space-evenly;
	border-top: #776 solid calc(var(--scale) * 2px);
}
label {
	display: contents;
}
input {
	display: none;
}
b {
	contain: none;
	
	box-sizing: border-box;
	width: 20em;
	height: 14em;
	
	border: solid 1em;
	border-color: #FFD #887 #666 #DDB;
	box-shadow: calc(1em/3) calc(1em/3) 1em black;
	
	display: grid;
	align-content: center;
	justify-content: center;
	text-align: center;
	text-transform: uppercase;
	background: #AAAA90;
	color: #221;
	overflow: hidden;
	border-radius: 1em;
	margin: 1em;
	text-shadow: calc(1em/3) calc(1em/3) 0 #BBA, calc(-1em/3) calc(-1em/3) 0 #776;
}
input[type="radio"] + b {
	border-radius: 8em;
}
hr {
	all: unset;
	margin: 0;
	width: calc(1px);
	background: linear-gradient(45deg, #AA9, #665, #AA8);
}
b span {
	font-size: 5em;
}

b:hover {
	background: #CCC;
	box-shadow: calc(1em/3) calc(1em/3) calc(1em/3) black;
}

:checked + b, input:not([type="radio"]):not(:disabled):active + b {
	color: #FFF078;
	text-shadow: 0 0 calc(1em/3) red;
	transition: none;
}
:checked + b, :active + b {
	border-color: #776 #444 #444 #776;
	box-shadow: 0 0 calc(10em/3) 0 inset black, 0 0 calc(10em/3) 0 inset white, 0 0 calc(1em/3) 0 #FF8;
	background: #887;
}
b.color > span {
	display: block;
	background: currentColor;
	font-size: unset;
	width: 16em;
	height: 10em;
	border-radius: 4.5em;
	box-shadow: 0 0 calc(10em/3) 0 inset black, 0 0 calc(10em/3) 0 inset white;
}
:checked + b.color > span {
	box-shadow: 0 0 calc(10em/3) 0 inset #0008, 0 0 calc(10em/3) 0 inset white, 0 0 calc(8em/3) calc(-2em/3) currentColor;
}

:disabled + b {
	border-color: #776 #444 #444 #776;
	box-shadow: 0 0 calc(10em/3) 0 inset black, 0 0 calc(10em/3) 0 inset white;
	background: #887;
	color: #666;
	/*border-color: #D0D0B0 #777 #777 #D0D0B0;
	color: #666;
	background: #998;
	box-shadow: 0 0 calc(1em/3) gray;
	text-shadow: none;*/
}
b.icon span {
	font-weight: normal;
	font-size: 10em;
}
div {
	padding: calc(var(--scale) * 2px) 0;
	contain: none;
	display: grid;
	align-content: start;
	grid-auto-flow: row;
}
b canvas {
	width: calc(14em / 5);
	border-radius: 3em;
	/*box-shadow: 0 0 calc(1em/3) inset white;*/
	/*background: none;*/
}
b > span {
	display: contents;
}
`

ChatDraw.style = document.createElement('link')
ChatDraw.style.rel = 'stylesheet'
ChatDraw.style.href = 'style.css'

customElements.define('chat-draw', ChatDraw)
