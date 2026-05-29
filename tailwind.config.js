export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      colors: {
        royal: '#2D1B69',
        ink: '#0B071A',
        gold: '#F7C873',
        mint: '#62E6AC',
        coral: '#FF7A8A'
      },
      boxShadow: {
        glow: '0 24px 80px rgba(45, 27, 105, 0.42)',
        glass: '0 18px 60px rgba(6, 3, 18, 0.42)'
      },
      backgroundImage: {
        'app-radial': 'radial-gradient(circle at 20% 0%, rgba(247, 200, 115, 0.22), transparent 34%), radial-gradient(circle at 80% 10%, rgba(98, 230, 172, 0.16), transparent 34%), linear-gradient(135deg, #0B071A 0%, #2D1B69 50%, #140A36 100%)'
      }
    }
  },
  plugins: []
};
