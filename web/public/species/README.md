# Species photos

Drop species images here, then point each entry at its file in
`web/src/lib/species.js`:

```js
{
  name: 'Philippine Duck',
  scientific: 'Anas luzonica',
  photo: '/species/philippine-duck.jpg',
  credit: 'Wikimedia Commons, CC BY-SA 4.0',
  ...
}
```

Cards without a `photo` render text only, so the guide stays correct while
images are still being collected. Add photos one at a time if that is easier.

## Rules

- **Licensing:** use only public-domain (CC0) or CC-licensed photos, and fill
  in `credit`. Credits render under the species guide automatically. A
  defended capstone should not ship photos it has no right to use.
- **Size:** landscape, around 800px wide, under ~120KB each. They are served
  as static files, so they do not grow the JavaScript bundle, but large images
  still slow the page down.
- **Framing:** cards crop to 4:3, so keep the animal centred.

## Suggested sources

- Wikimedia Commons (check the licence on each file page)
- iNaturalist observations marked CC0 or CC BY
- DENR / Biodiversity Management Bureau public materials
