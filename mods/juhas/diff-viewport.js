import {View} from 'gpui-kit';
import {diffPane} from './ui.js';
export default class DiffViewport extends View {
 init(p){this.owner=p.owner;}
 render(cx){return diffPane(this.owner,cx);}
}
