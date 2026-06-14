export default function ContactInfo({ site }) {
  return (
    <div className="contact-grid">
      <div>
        <h2>Contact & Location</h2>
        <p className="description">{site.address}</p>
        <div className="actions">
          <a className="button primary" href={site.mapUrl} target="_blank" rel="noreferrer">
            Open Map
          </a>
          <a className="button" href={site.uberEatsUrl} target="_blank" rel="noreferrer">
            Uber Eats
          </a>
        </div>
      </div>

      <div className="contact-details">
        <div>
          <h3>Call Us</h3>
          <p>
            <a href={`tel:${site.phone}`}>{site.phone}</a>
          </p>
        </div>

        <div>
          <h3>Hours</h3>
          <dl className="hours-list">
            {site.hours.map((entry) => (
              <div key={entry.days}>
                <dt>{entry.days}</dt>
                <dd>{entry.time}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
