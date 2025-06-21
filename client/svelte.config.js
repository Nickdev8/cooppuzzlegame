import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      // where to write your build
      pages:  'build',
      assets: 'build',
      // if you have client-side routing and want a SPA fallback:
      fallback: 'index.html'
    })
  }
}