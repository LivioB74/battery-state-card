import { html, LitHtml } from "./lit-element";
import BatteryViewModel from "./battery-vm";
import { isNumber } from "./utils";
import { IBatteryGroupViewData } from "./types";


const header = (text: string) => html`
<div class="card-header">
    <div class="truncate">
        ${text}
    </div>
</div>
`;



const icon = (icon?: string, color?: string) => icon && html`
<div class="icon">
    <ha-icon
        style="color: ${color}"
        icon="${icon}"
    ></ha-icon>
</div>
`;

export const card = (headerText: string | undefined, contents: LitHtml[]) => {
    return html`
<ha-card>
    ${headerText ? header(headerText) : ""}
    <div class="card-content">
        ${contents}
    </div>
</ha-card>
`
};

export const collapsableWrapper = (contents: LitHtml[], model: IBatteryGroupViewData) => {
    const elemId = "expander" + Math.random().toString().substr(2);
    return html`
<div class="expandWrapper entity-spacing">
    <div class="entity-row toggler" @click=${(e: MouseEvent) => (<HTMLElement>e.currentTarget).classList.toggle("expanded")}>
        ${icon(model.icon, model.iconColor)}
        <div class="name truncate">
            ${model.name}
        </div>
        <div class="chevron">&lsaquo;</div>
    </div>
    <div style="max-height: ${contents.length * 50}px">${contents}</div>
</div>
`
};

export const empty = () => html``;