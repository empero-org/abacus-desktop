# Third-party notices

Abacus Desktop is licensed under the Apache License, Version 2.0 (see
`LICENSE`). It contains code and assets from the projects below. npm packages
the app depends on are not copied into this repository; each ships with its own
license in `node_modules`, and inside the packaged app.

## ZCode

- Source: https://github.com/zai-org/ZCode (3.14.3)
- License: Apache License, Version 2.0
- Used for: the starting point of this repository. The UI primitives in
  `packages/ui/src/components/` came from ZCode's UI kit and were modified for
  Abacus. The rest of ZCode was removed or rewritten.

## AI Elements

- Source: https://github.com/vercel/ai-elements
- Copyright 2023 Vercel, Inc.
- License: Apache License, Version 2.0
- Used for: `packages/ui/src/components/ai-elements/conversation.tsx` and
  `shimmer.tsx`, modified by ZCode and by Empero.

## shadcn/ui

- Source: https://github.com/shadcn-ui/ui
- Copyright (c) 2023 shadcn
- License: MIT
- Used for: the components in `packages/ui/src/components/ui/` (modified by
  ZCode and by Empero), and `packages/ui/src/vendor/shadcn-tailwind.css` (from
  the `shadcn` package, 4.1.1).

```
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonts

- Inter (https://github.com/rsms/inter), SIL Open Font License 1.1:
  `packages/ui/src/abacus/fonts/LICENSE-Inter.txt`
- JetBrains Mono (https://github.com/JetBrains/JetBrainsMono), SIL Open Font
  License 1.1: `packages/ui/src/abacus/fonts/LICENSE-JetBrainsMono.txt`
