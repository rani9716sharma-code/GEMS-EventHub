import { Link } from 'react-router-dom'
import { assetUrl } from '../lib/paths'
export default function Brand(){return <Link className="brand eventhub-brand" to="/" aria-label="GEMS EventHub home"><img className="eventhub-brand-logo" src={assetUrl('/assets/gems-logo.png')} alt="" /><span className="brand-copy"><strong>GEMS EventHub</strong><small>College Event Management</small></span></Link>}
