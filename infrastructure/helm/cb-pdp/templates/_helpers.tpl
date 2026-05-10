{{/* Standard Helm starter helpers. */}}
{{- define "cb-pdp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cb-pdp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "cb-pdp.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cb-pdp.labels" -}}
helm.sh/chart: {{ include "cb-pdp.chart" . }}
{{ include "cb-pdp.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "cb-pdp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cb-pdp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "cb-pdp.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cb-pdp.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
