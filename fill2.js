x={
	flood_fill(pos) {
		const {x, y} = pos.Floor()
		const {width, height} = this.canvas
		const data = this.get_data()
		const pixels = new Uint32Array(data.data.buffer)
		const old = pixels[x + y*width]
		const queue = [[x+1, x, y, -1]]
		const size = this.brush.fills.length-2
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
		
		// todo: expand spans immediately when found so we dont have to do the extra work.
		// 3 types of spans:
		// 1: entirely above the parent span (dont need to scan backwards at all)
		// 2: extends left of parent (scan backwards to the left)
		// 3: extends right of parent (scan backwards to the right)
		// when scanning forwards:
		// 1: scan left from left edge, to find leftmost bg pixel. if we found anything, then this gets added as a type 2 span
		// 2: scan right from left edge, combine these 2 into the first span. (type
		
		// actually no. what if we add scan regions to the stack instead? eg
		// 0: pop a region + direction from the stack.
		// 1: scan-fill left from the left edge. if we found anything, add a new region below this, poining down.
		// 2: move to the left edge
		// 3: in a loop:
		// - scan-fill rightwards, and add a region above. (for the first region added: include the pixels found by the leftwards scan)
		// - if we're still within our region, skip over any filled pixels (up to the region edge)
		// 4: if we ended up to the right of the region, add a new region below us as well, pointing downwards
		while (queue.length) {
			
		}
		
		while (queue.length) {
			const [x1, x2, y, dir] = queue.pop()
			// expand span
			const left = to_wall(x1-1, y, -1, 0)
			const right = to_wall(x2+1, y, +1, width-1)
			// this is broken by the different brush thickness settings..
			if (size==-1)
				this.c2d.fillRect(left, y, right-left+1, 1)
			else if (size==0) {
				this.c2d.fillRect(left, y-1, right-left+1, 3)
				this.c2d.fillRect(left-1, y, 1, 1)
				this.c2d.fillRect(right+1, y, 1, 1)
			} else
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
