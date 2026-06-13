export default function Header({ site }) {
  return (
    <header className="site-header">
      <nav className="container nav" aria-label="Main navigation">
        <a className="brand" href="#home">
          {site.name}
        </a>
        <div className="nav-links">
          <a href="#menu">Menu</a>
          <a href="#contact">Contact</a>
          <a href={site.uberEatsUrl} target="_blank" rel="noreferrer">
            Order
          </a>
        </div>
      </nav>
    </header>
  );
}
