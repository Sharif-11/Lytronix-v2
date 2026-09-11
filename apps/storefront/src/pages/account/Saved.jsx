import SavedProducts from '../../components/SavedProducts';
import usePageTitle from '../../lib/usePageTitle';

export default function Saved() {
  usePageTitle('পছন্দের প্রোডাক্ট');
  return <SavedProducts />;
}
