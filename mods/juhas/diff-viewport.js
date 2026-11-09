import {View} from 'gpui-kit';
import {diffPane} from './ui.js';

// Async work can finish while a retained row owns the active native call.
// Keep an explicit notification target for the entire virtual diff list.
export default class DiffViewport extends View {
 init({owner}){this.owner=owner;}
 render(cx){return diffPane(this.owner,cx);}
}
