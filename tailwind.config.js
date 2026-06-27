/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        saffron: '#eb8a17',
        river: '#0f766e',
        clay: '#8b5e3c',
        mist: '#eef3ef',
      },
      boxShadow: {
        card: '0 18px 45px -28px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [],
};
