const EMPTY_VALUE = "-";
const MODULE_NAME = "skill-customization-5e";
const SKILL_BONUS_KEY = "skill-bonus";

Hooks.once("setup", () => {
	if (game.modules.get("lib-wrapper").active) {
		patchActor5ePrepareData();
		patchActor5eRollSkill();
	}
});

Hooks.once("ready", () => {
	if (game.modules.get("lib-wrapper").active) {
		Hooks.on("renderActorSheet", injectActorSheet);
	} else {
		ui.notifications.notify("Skill Customization | LibWrapper module is not active. This module won't be loaded.", "warning", { permanent: true });
	}
});

function patchActor5ePrepareData() {
	libWrapper.register(
		MODULE_NAME,
		"CONFIG.Actor.documentClass.prototype.prepareData",
		function patchedPrepareData(wrapped, ...args) {
			wrapped(...args);

			const skills = this.data.data.skills;
			for (let key in skills) {
				let skill = skills[key];
				let bonus = this.getFlag(MODULE_NAME, `${key}.${SKILL_BONUS_KEY}`) || 0;
				let bonusAsInt = parseInt(Number(bonus));
				if (!isNaN(bonusAsInt)) {
					skill.total += bonusAsInt;

					// recalculate passive score, taking observant feat into account
					const observant = this.data.flags.dnd5e?.observantFeat;
					const passiveBonus = observant && CONFIG.DND5E.characterFlags.observantFeat.skills.includes(key) ? 5 : 0;
					skill.passive = 10 + skill.total + passiveBonus;
				}
			}
		},
		"WRAPPER"
	);
}

function patchActor5eRollSkill() {
	libWrapper.register(MODULE_NAME, "CONFIG.Actor.documentClass.prototype.rollSkill", function patchedRollSkill(wrapped, ...args) {
		const [skillId, options] = args;
		const skillBonus = this.getFlag(MODULE_NAME, `${skillId}.${SKILL_BONUS_KEY}`);
		if (skillBonus) {
			const extraOptions = {
				parts: ["@extra"],
				data: {
					extra: skillBonus,
				},
			};
			mergeObject(options, extraOptions);
		}
		return wrapped(...args);
	});
}

function injectActorSheet(app, html, data) {
	html.find(".skills-list").addClass("skill-customize");

	const skillRowSelector = ".skills-list .skill";

	const actor = app.actor;

	html.find(skillRowSelector).each(function () {
		const skillElem = $(this);
		const skillKey = $(this).attr("data-skill");
		const bonusKey = `${skillKey}.${SKILL_BONUS_KEY}`;
		const selectedAbility = actor.data.data.skills[skillKey].ability;

		let selectElement = $("<select>");
		selectElement.addClass("skill-ability-select");
		Object.keys(actor.data.data.abilities).forEach((ability) => {
			let abilityOption = $("<option>");
			let abilityKey = ability.charAt(0).toUpperCase() + ability.slice(1);
			let abilityString = game.i18n.localize(`DND5E.Ability${abilityKey}`).slice(0, 3);

			abilityOption.attr("value", ability);

			if (ability === selectedAbility) {
				abilityOption.attr("selected", "true");
			}

			abilityOption.text(abilityString);
			selectElement.append(abilityOption);
		});

		selectElement.change(function (event) {
			let newData = { data: { skills: {} } };
			newData.data.skills[skillKey] = { ability: event.target.value };
			actor.update(newData);
		});

		let textBoxElement = $('<input type="text" size=2>');
		textBoxElement.addClass("skill-cust-bonus");
		textBoxElement.val(actor.getFlag(MODULE_NAME, bonusKey) || EMPTY_VALUE);

		textBoxElement.click(function () {
			$(this).select();
		});

		textBoxElement.change(async function (event) {
			const bonusValue = event.target.value;
			if (bonusValue === "-" || bonusValue === "0") {
				await actor.unsetFlag(MODULE_NAME, bonusKey);
				textBoxElement.val(EMPTY_VALUE);
			} else {
				try {
					const rollResult = await new Roll(`1d20 + ${bonusValue}`).roll({ async: true });
					const valid = !isNaN(rollResult._total);

					if (valid) {
						await actor.setFlag(MODULE_NAME, bonusKey, bonusValue);
					} else {
						textBoxElement.val(actor.getFlag(MODULE_NAME, bonusKey) || EMPTY_VALUE);
					}
				} catch (err) {
					textBoxElement.val(actor.getFlag(MODULE_NAME, bonusKey) || EMPTY_VALUE);
				}
			}
		});

		skillElem.find(".skill-ability").after(selectElement);
		skillElem.find(".skill-ability").detach();
		selectElement.after(textBoxElement);
	});
}
