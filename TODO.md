# Minor bugs/tweaks
- (fixed) re-parenting a node doesn't move the viewport if the new location for the node is off screen or near the edge, reparenting should follow the same logic that moving a node around does so that it stays within a margin area of the border
- (fixed) the obsidian hamburger menu doesn't have the keyboard shortcuts in it
- (fixed) the hamburger menu in both web and obsidian modes needs to be wider so that the names of actions (like "Keyboard Overlay" don't wrap to a second line)
- (fixed) the exported SVG for dark mode uses black text for node text and cannot be seen, only links and the root nodes can be read without doing a "select all"
- (fixed) the exported SVG for light mode seems to also be the same dark mode, so it feels like we're missing some colors in the exported SVG that should be there. It's actually not the same background color as the dark mode, I think it's just black, so likely unstyled.
- (fixed) right-side children of wide parent nodes overlap with the parent because child x was computed as a fixed offset from parent.x instead of from the parent's right edge

# Next Features

- extract styles/color palette's into their own structure for easy swapping out, each is associated with light or dark and can be chosen.
    - should the colors be part of the schema, so others see the same things the user sees (and explicitly set it to light/dark to match the given style rather than the "system" default)?
    - can we possibly use terminal style names as inspiration (or maybe even import them? what would this look like? so I could say solarized light or solarized dark and it'd use the background color from that theme and the 16 main colors from its pallette for different mindnode and text colors)
    - are there any existing resources that I could look at to mine for some solid, known options for light and dark?

# Other Possible TODOs

- hamburger menu additions
    - about dialog
    - find/cmd-f?

- add PWA icons (favicon.ico, icon-192.png, icon-512.png) -- vite.config.ts manifest references them but files don't exist in packages/web/public/

- add LICENSE

- talk through url schema, right now we're not doing anything with the url there are a few issues that I want to talk through
    - possibility of encoding document in the url so it could be sent to someone else
        - where does this fall down, what are the length limitations for it? would probably preclude images
    - giving each document its own unique ID that's in the url, when we're using local storage is having them listed an option? are we storing them separately from each other now?


