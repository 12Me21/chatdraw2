function draw_button(arg) {
	for (let type in arg) {
		let input = document.createElement('input')
		let name = arg[type]
		Object.assign(input, {type, name, value:arg.value})
		let span = document.createElement('b')
		let s = document.createElement('span')
		s.append(arg.text)
		span.append(s)
		if (arg.text[0] > '~' || arg.icon)
			span.classList.add('icon')
		if (name=='color') {
			/*span.append(document.createElement('span'))*/
			span.classList.add('color')
			span.style.color = arg.value
		}
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
		
		/*let color_icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
		let color_path = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
		/*color_icon.viewBox.baseVal.width = 1
		  color_icon.viewBox.baseVal.height = 1
		color_icon.setAttribute('viewBox', "0 0 1 1")
		color_path.width.baseVal.value = "1"
		color_path.height.baseVal.value = "1"
		color_path.style.fill = "currentColor"
		color_icon.append(color_path)*/
		
		let buttons = [
			{items:[
				{button:'clear', text:"reset"},
				{button:'undo', text:"↶"},
				{button:'redo', text:"↷"},
				{button:'fill', text:"fill"},
				...Object.keys(tools).map(k=>{
					return {radio:'tool', text:k, value:k}
				}),
			], cols:3},
			{items:[
				{radio:'comp', text:"all", value:'source-over'},
				{radio:'comp', text:"below", value:'destination-over'},
				{radio:'comp', text:"in", value:'source-atop'},
				{radio:'comp', text:"erase", value:'destination-out'},
			]},
			{items:[
				{button:'pick', text:"new"},
				{button:'bg', text:" ➙bg"},
				...['#000000','#FFFFFF','#FF0000','#0000FF','#00FF00','#FFFF00'].map(x=>({
					radio:'color', text:"", value:x,
				}))
			], cols:2},
			//{color:'pick', text:"■"},
			{items:brushes.map((b,i)=>{
				return {radio:'brush', text:""+(i+1), value:i, icon:true}
			}),size:1},
			{items:patterns.map((b,i)=>{
				return {radio:'pattern', text:b[1], value:i}
			}),size:1,flow:'column'},
		]
		for (let {items,size=2,flow,cols} of buttons) {
			let fs = document.createElement('div')
			for (let sb of items) {
				fs.append(draw_button(sb))
			}
			form.append(fs)
			if (!cols)
				cols = Math.ceil(items.length/(8/size))
			fs.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
			fs.style.gridTemplateRows = `repeat(${Math.ceil(8/size)}, 1fr)`
			if (size)
				fs.style.setProperty('font-size', `calc(${size/2}px * var(--scale))`)
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
			bg: ()=>d.erase_color(form.color.value),
			undo: ()=>d.history_do(false),
			redo: ()=>d.history_do(true),
			add: ()=>d.history_do(true),
			replace: ()=>d.history_do(true),
			remove: ()=>d.history_do(true),
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
		"gap" 1px
		"controls" auto
		/ min-content;
	padding: 1px;
	--scale: 2;
	background: #C0C0B0;
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
	/*line-height: 1;*/
	font-variant-caps: small-caps;
	background: #AA9;
	color: #221;
	overflow: hidden;
	border-radius: 1em;
	margin: 2em;
	margin-top: 0;
	margin-left: 0;
	text-shadow: calc(1em/3) calc(1em/3) 0 #BBA, calc(-1em/3) calc(-1em/3) 0 #776;
	/*transition: color 2s cubic-bezier(.19,1,.22,1), text-shadow 4s cubic-bezier(.19,1,.22,1);*/
}
input[type="radio"] + b {
	border-radius: 8em;
}
b span {
	font-size: 6em;
}

b:hover {
	background: #CCC;
	box-shadow: calc(1em/3) calc(1em/3) calc(1em/3) black;
}

:checked + b, input[type="button"]:not(:disabled) + b:active {
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
	width: 14em;
	height: 9em;
	border-radius: 4.5em;
	box-shadow: 0 0 calc(10em/3) 0 inset black, 0 0 calc(10em/3) 0 inset white;
}
:checked + b.color > span {
	box-shadow: 0 0 calc(10em/3) 0 inset #0008, 0 0 calc(10em/3) 0 inset white, 0 0 calc(8em/3) calc(-2em/3) currentColor;
}

:disabled + b {
	border-color: #D0D0B0 #777 #777 #D0D0B0;
	color: #666;
	background: #998;
	box-shadow: 0 0 calc(1em/3) gray;
	text-shadow: none;
}
b.icon span {
	font-weight: normal;
	font-size: 10em;
}
div {
	contain: none;
	display: grid;
	align-content: start;
	grid-auto-flow: row;
}
b canvas {
	width: calc(16em / 6);
	border-radius: 4.5em;	
	/*background: none;*/
}
b > span {
	display: contents;
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
