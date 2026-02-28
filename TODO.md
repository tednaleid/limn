- hamburger menu additions
    - about dialog
    - keyboard shortcuts overlay
    - find/cmd-f?

- zoom buttons/level - similar to excalidraw
- undo/redo buttons

- multi-select? this might be more complication than we want, let's see how usability is

- version JSON/.mindmap format, have tests to ensure we are compatible with current version
    - possibly a message (with at least one image) that is of the current format that is in the test
    - need to be aware of breaking change to format and ensure we have instructions about converting/upgrading files that are of a previous version
    - likely worth adding a JSON schema as an explicit file in the repo and something we compare against

- code coverage metrics?

- split up Editor.ts into logical portions, deeper analysis on this for what makes the most sense.