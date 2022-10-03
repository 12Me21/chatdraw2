// todo: can we just restyle the normal ones instead? why are we doing it this way?
function draw_button({type='button', name, value="", text, icon}) {
	const input = document.createElement('input')
	Object.assign(input, {type, name, value})
	const span = document.createElement('b')
	if (text[0]=="\b") {
		text=text.slice(1)
		icon = true
	}
	if (icon)
		span.classList.add('icon')
	if (name=='color') {
		span.classList.add('color')
		span.style.color = `var(--color-${value})`
	}
	const label = document.createElement('label')
	label.append(input, span)
	const s = document.createElement('span')
	s.append(text)
	span.append(s)
	return label
}
/*
<label>
	<input ...>
	<b>
		<span>...</span>
	</b>
</label>
*/

function draw_form(choices, actions, buttons) {
	let form = document.createElement('form')
	form.autocomplete = 'off'
	form.method = 'dialog'
	form.onchange = ev=>{
		const e = ev.target
		if (e.type=='radio')
			choices[e.name].change(e.value)
		else if (e.type=='color')
			actions[e.name](e.value)
	}
	form.onclick = ev=>{
		const e = ev.target
		if (e.type=='button')
			actions[e.name]()
	}
	//d.form.append(document.createElement('hr'))
	for (let {title, items, size=2, rows=0, cols} of buttons) {
		const fs = document.createElement('div')
		let ti = document.createElement('div')
		ti.append(title)
		fs.append(ti)
		for (const sb of items)
			fs.append(draw_button(sb))
		form.append(fs, document.createElement('hr'))
		if (!cols)
			cols = Math.ceil(items.length/(8/size))
		if (cols)
			fs.style.gridTemplateColumns = `repeat(${cols}, 1fr)`
		fs.style.gridTemplateRows = `auto repeat(${rows}, 1fr)`
		if (rows)
			fs.style.gridAutoFlow = 'column'
		fs.style.fontSize = `calc(${size/2}px * var(--scale))`
	}
	form.lastChild.remove()
	return form
}

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

		
// ew. just pass like, a 16 bit number and hardcode the list idk.
// maybe we want an input for specifying the pattern transform x/y. not sure how to design this though. numeric inputs kinda suck.
// maybe have up/down/left/right shift buttons
// and show the patterns on the buttons in their absolute positions?
// also we should show a preview of the current brush on the overlay layer.
// actually we can just shift the entire drawing to "choose" which offset ww..
function dither_pattern(level, context, offset=0) {
	const od = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
	const canvas = document.createElement('canvas')
	canvas.width = 4
	canvas.height = 4
	const c2d = canvas.getContext('2d')
	const data = c2d.createImageData(4, 4)
	for (let x=0; x<16; x++)
		if (od[x+offset & 15] <= level)
			data.data[x<<2|3] = 0xFF
	// hack: we want a larger canvas to use as a button label
	c2d.putImageData(data, 0, 0)
	const pattern = context.createPattern(canvas, 'repeat')
	canvas.width = 7
	canvas.height = 5
	for (let y=0;y<5;y+=4)
		for (let x=-3;x<8;x+=4)
			c2d.putImageData(data, x, y)
	pattern._canvas = canvas
	return pattern
}

// idea: mode where you can move the cursor 1px etc. at a time
// by clicking the top/bottom/left/right quadrants of the canvas
// useful for shift moving 1px for dither align?
var o = `
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
