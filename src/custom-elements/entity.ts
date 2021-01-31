import { HassEntity, HomeAssistant } from "../ha-types";
import { css, html, LitElement } from "../lit-element";
import { IBatteryEntity } from "../types";
import { getColorInterpolationForPercentage, getRelativeTime, isNumber, log, processStyles as prefixCssSelectors, safeGetArray } from "../utils";

const secondaryInfo = (text?: string) => text && html`
<div class="secondary">${text}</div>
`;



const defaultIconColor = "inherit";

/**
 * Some sensor may produce string value like "45%". This regex is meant to parse such values.
 */
const stringValuePattern = /\b([0-9]{1,3})\s?%/;



    /**
     * Validates if given color values are correct
     * @param color_gradient List of color values to validate
     */
    const isColorGradientValid = (color_gradient: string[]) => {
        let colorPattern = /^#[A-Fa-f0-9]{6}$/;

        if (color_gradient.length < 2) {
            log("Value for 'color_gradient' should be an array with at least 2 colors.");
            return;
        }

        for (const color of color_gradient) {
            if (!colorPattern.test(color)) {
                log("Color '${color}' is not valid. Please provide valid HTML hex color in #XXXXXX format.");
                return false;
            }
        }

        return true;
    }

/**
 * Card main class.
 */
export class BatteryEntityRow extends LitElement {

    /**
     * Custom styles comming from config.
     */
    private cssStyles: string = "";

    /**
     * Icon showing battery level/state.
     */
    private icon: string = "mdi:battery-unknown";

    /**
     * Icon color.
     */
    private iconColor: string = "inherit";

    /**
     * Battery name.
     */
    private name: string = "";

    /**
     * Battery secondary info text.
     */
    private secondaryInfo: string = "";

    /**
     * Element css class names.
     */
    private classNames: string = "";

    /**
     * Battery state.
     */
    private state: string = "Unknown";

    /**
     * Click action.
     */
    private action: Function | undefined;

    /**
     * Raw config used to check if there were changes.
     */
    private rawConfig: string = "";

    /**
     * Card configuration.
     */
    private config: IBatteryEntity | undefined;

    /**
     * Home assistant instance.
     */
    private homeAssistant: HomeAssistant | undefined;

    /**
     * CSS for the card.
     */
    static get styles() {
        return css``;
    }

    /**
     * List of properties which trigger update when changed
     */
    static get properties() {
        return {
            icon: { type: String },
            iconColor: { type: String },
            name: { type: String },
            secondaryInfo: { type: String },
            classNames: { type: String },
            state: { type: String },
            cssStyles: { type: String },
            action: { type: Function },
        };
    }

    /**
     * Called by HA on init or when configuration is updated.
     *
     * @param config Card configuration
     */
    setConfig(config: IBatteryEntity) {
        if (!config.entity) {
            throw new Error("You need to define entities, filter.include or collapse.group");
        }

        // check for changes
        const rawConfig = JSON.stringify(config);
        if (this.rawConfig === rawConfig) {
            // no changes so stop processing
            return;
        }

        this.rawConfig = rawConfig;

        // config is readonly and we want to apply default values so we need to recreate it
        this.config = JSON.parse(rawConfig);
    }

    /**
     * Called when HA state changes (very often).
     */
    set hass(hass: HomeAssistant) {
        this.homeAssistant = hass;
        this.processHassUpdate();
    }

    /**
     * Renders the card. Called when update detected.
     */
    render() {
        return html`
        <div class="entity-row entity-spacing battery ${this.classNames}" @click=${this.action}>
            <div class="icon">
                <ha-icon
                    style="color: ${this.iconColor}"
                    icon="${this.icon}"
                ></ha-icon>
            </div>
            <div class="name truncate">
                ${this.name}
                ${secondaryInfo(this.secondaryInfo)}
            </div>
            <div class="state">
                ${this.state}${isNumber(this.state) ? html`&nbsp;%` : ""}
            </div>
        </div>
        `;
    }

    /**
     * Called just after the update is finished (including rendering)
     */
    updated() {
        if (!this.config?.style || this.cssStyles == this.config.style) {
            return;
        }

        this.cssStyles = this.config.style;

        let styleElem = this.shadowRoot!.querySelector("style");
        if (!styleElem) {
            styleElem = document.createElement("style");
            styleElem.setAttribute("type", "text/css");
            this.shadowRoot!.appendChild(styleElem);
        }

        // prefixing all selectors
        styleElem.innerHTML = prefixCssSelectors("ha-card", this.cssStyles);
    }

    private processHassUpdate() {

        let entityData = this.homeAssistant?.states[this.config!.entity];

        if (!entityData || !this.config) {
            // do not update if data or config is missing
            return;
        }

        this.name = this.config.name || entityData.attributes.friendly_name;

        this.state = this.getState(entityData);

        const batteryLevel = Number(this.state);
        const isCharging = this.getChargingState(this.state);

        this.icon = this.getIcon(batteryLevel, isCharging);
        this.iconColor = this.getIconColor(batteryLevel, isCharging);
        this.secondaryInfo = this.getSecondaryInfo(entityData, isCharging);
    }

    /**
     * Gets battery level
     * @param entityData Entity state data
     */
    private getState(entityData: HassEntity): string {
        const config = this.config!;
        let level: string;

        if (config.attribute) {
            level = entityData.attributes[config.attribute];
            if (level == undefined) {
                log(`Attribute "${config.attribute}" doesn't exist on "${config.entity}" entity`);
                level = this.homeAssistant!.localize("state.default.unknown");
            }
        }
        else {
            const candidates: string[] = [
                entityData.attributes.battery_level,
                entityData.attributes.battery,
                entityData.state
            ];

            level = candidates.find(n => n !== null && n !== undefined)?.toString() || this.homeAssistant!.localize("state.default.unknown");
        }

        // check if we should convert value eg. for binary sensors
        if (config.state_map) {
            const convertedVal = config.state_map.find(s => s.from == level);
            if (convertedVal == undefined) {
                log(`Missing option for '${level}' in 'state_map'`);
            }
            else {
                level = convertedVal.to.toString();
            }
        }

        if (!isNumber(level)) {
            const match = stringValuePattern.exec(level);
            if (match != null) {
                level = match[1];
            }
        }

        if (config.multiplier && isNumber(level)) {
            level = (config.multiplier * Number(level)).toString();
        }

        // for dev/testing purposes we allow override for value
        level = config.value_override === undefined ? level : config.value_override;

        if (!isNumber(level)) {
            // capitalize first letter
            level = level.charAt(0).toUpperCase() + level.slice(1);
        }

        return level;
    }

    private getIcon(level: number, isCharging: boolean) {

        const config = this.config!;

        if (isCharging && config.charging_state?.icon) {
            return config.charging_state.icon;
        }

        if (config.icon) {
            return config.icon;
        }

        if (isNaN(level) || level > 100 || level < 0) {
            return "mdi:battery-unknown";
        }

        const roundedLevel = Math.round(level / 10) * 10;
        switch (roundedLevel) {
            case 100:
                return isCharging ? 'mdi:battery-charging-100' : "mdi:battery";
            case 0:
                return isCharging ? "mdi:battery-charging-outline" : "mdi:battery-outline";
            default:
                return (isCharging ? "mdi:battery-charging-" : "mdi:battery-") + roundedLevel;
        }
    }
    
    /**
     * Gets battery level color
     * @param batteryLevel Battery percentage level
     * @param isCharging Whether battery is in charging state
     */
    private getIconColor(batteryLevel: number, isCharging: boolean): string {
        const config = this.config!;

        if (isCharging && config.charging_state?.color) {
            return config.charging_state.color;
        }

        if (isNaN(batteryLevel) || batteryLevel > 100 || batteryLevel < 0) {
            return defaultIconColor;
        }

        if (config.color_gradient && isColorGradientValid(config.color_gradient)) {
            return getColorInterpolationForPercentage(config.color_gradient, batteryLevel);
        }

        const thresholds = config.color_thresholds ||
            [{ value: 20, color: "var(--label-badge-red)" }, { value: 55, color: "var(--label-badge-yellow)" }, { value: 101, color: "var(--label-badge-green)" }];

        return thresholds.find(th => batteryLevel <= th.value)?.color || defaultIconColor;
    }
    
    /**
     * Gets secondary info
     * @param entityData Entity state data
     * @param isCharging Whether battery is in charging state
     */
    private getSecondaryInfo(entityData: HassEntity, isCharging: boolean): string {
        const config = this.config!;

        if (config.secondary_info) {
            if (config.secondary_info == "charging") {
                if (isCharging) {
                    return config.charging_state?.secondary_info_text || "Charging"; // todo: think about i18n
                }

                return <any>null;
            }
            else {
                const val = (<any>entityData)[config.secondary_info] || entityData.attributes[config.secondary_info] || config.secondary_info;
                return isNaN(Date.parse(val)) ? val : getRelativeTime(this.homeAssistant!, val);
            }
        }

        return <any>null;
    }

    /**
     * Gets charging state if configuration specified.
     * @param state Current state of the battery (e.g. it can have "Charging" word)
     */
    private getChargingState(state: string): boolean {
        const config = this.config!;
        const chargingConfig = config.charging_state;
        if (!chargingConfig) {
            return false;
        }

        // take the state from the state as it originate from various places
        let entityWithChargingState = this.homeAssistant!.states[config.entity];

        // check whether we should use different entity to get charging state
        if (chargingConfig.entity_id) {
            entityWithChargingState = this.homeAssistant!.states[chargingConfig.entity_id]
            if (!entityWithChargingState) {
                log(`'charging_state' entity id (${chargingConfig.entity_id}) not found`);
                return false;
            }

            state = entityWithChargingState.state;
        }

        const attributesLookup = safeGetArray(chargingConfig.attribute);
        // check if we should take the state from attribute
        if (attributesLookup.length != 0) {
            // take first attribute name which exists on entity
            const exisitngAttrib = attributesLookup.find(attr => entityWithChargingState.attributes[attr.name] != undefined);
            if (exisitngAttrib) {
                return exisitngAttrib.value != undefined ?
                    entityWithChargingState.attributes[exisitngAttrib.name] == exisitngAttrib.value :
                    true;
            }
            else {
                // if there is no attribute indicating charging it means the charging state is false
                return false;
            }
        }

        const statesIndicatingCharging = safeGetArray(chargingConfig.state);

        return statesIndicatingCharging.length == 0 ? !!state : statesIndicatingCharging.some(s => s == state);
    }
}