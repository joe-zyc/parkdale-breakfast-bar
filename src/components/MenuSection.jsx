import MenuItem from './MenuItem.jsx';

export default function MenuSection({ section, isPhone }) {
  return (
    <section className="menu-section" id={section.id} role="tabpanel" aria-labelledby={`${section.id}-heading`}>
      <div className="menu-section-heading">
        <h3 id={`${section.id}-heading`}>{section.title}</h3>
        {section.description ? <p>{section.description}</p> : null}
      </div>

      <div className="menu-items">
        {section.items.map((item) => (
          <MenuItem key={`${section.id}-${item.name}`} item={item} isPhone={isPhone} />
        ))}
      </div>
    </section>
  );
}
