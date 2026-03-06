"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface FormField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

const fieldTypes = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Textarea" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
];

function generateId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function FormBuilder({ value, onChange }: FormBuilderProps) {
  const [fields, setFields] = useState<FormField[]>(() => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const updateFields = useCallback(
    (newFields: FormField[]) => {
      setFields(newFields);
      onChange(JSON.stringify(newFields));
    },
    [onChange]
  );

  const addField = () => {
    const newField: FormField = {
      id: generateId(),
      label: "",
      type: "text",
      required: false,
      placeholder: "",
    };
    updateFields([...fields, newField]);
  };

  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    updateFields(newFields);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = fields.map((field, i) =>
      i === index ? { ...field, ...updates } : field
    );
    updateFields(newFields);
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const newFields = [...fields];
    [newFields[index], newFields[newIndex]] = [
      newFields[newIndex],
      newFields[index],
    ];
    updateFields(newFields);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Form Fields
        </label>
        <Button type="button" variant="outline" size="sm" onClick={addField}>
          + Add Field
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
          No fields added yet. Click &quot;Add Field&quot; to start building
          your form.
        </div>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">
                Field {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveField(index, "up")}
                  disabled={index === 0}
                  className="h-7 px-2 text-xs"
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => moveField(index, "down")}
                  disabled={index === fields.length - 1}
                  className="h-7 px-2 text-xs"
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeField(index)}
                  className="h-7 px-2 text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Label"
                value={field.label}
                onChange={(e) =>
                  updateField(index, { label: e.target.value })
                }
                placeholder="Field label"
              />
              <Select
                label="Type"
                options={fieldTypes}
                value={field.type}
                onChange={(e) =>
                  updateField(index, { type: e.target.value })
                }
              />
              <Input
                label="Placeholder"
                value={field.placeholder || ""}
                onChange={(e) =>
                  updateField(index, { placeholder: e.target.value })
                }
                placeholder="Placeholder text"
              />
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      updateField(index, { required: e.target.checked })
                    }
                    className="rounded border-zinc-300"
                  />
                  Required
                </label>
              </div>
            </div>

            {field.type === "select" && (
              <div className="mt-3">
                <Input
                  label="Options (comma separated)"
                  value={(field.options || []).join(", ")}
                  onChange={(e) =>
                    updateField(index, {
                      options: e.target.value
                        .split(",")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
