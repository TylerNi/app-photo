import { Link } from 'react-router-dom';
import { PushButton } from '../ui/PushButton';

export function Settings() {
  return (
    <div className="settings">
      <Link className="settings-back" to="/">
        ‹ Retour
      </Link>

      <PushButton />
    </div>
  );
}
