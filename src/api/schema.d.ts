export interface paths {
    "/info": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["InformationService_GetInfo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ConnectorService_ListConnectors"];
        put?: never;
        post: operations["ConnectorService_CreateConnector"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/plugins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ConnectorService_ListConnectorPlugins"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["ConnectorService_ValidateConnector"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ConnectorService_GetConnector"];
        put: operations["ConnectorService_UpdateConnector"];
        post?: never;
        delete: operations["ConnectorService_DeleteConnector"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}/inspect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ConnectorService_InspectConnector"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PipelineService_ListPipelines"];
        put?: never;
        post: operations["PipelineService_CreatePipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/apply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * ApplyPipeline executes the plan for a desired pipeline config, gated on
         *     the caller presenting the hash of the plan it reviewed (a stale hash is
         *     refused, never partially applied). Against a running pipeline whose plan
         *     includes a restart-class change, this requires the server to have been
         *     started with the live-restart-apply operator flag — see
         *     docs/design-documents/20260708-live-server-deploy-apply.md and
         *     docs/operations/live-restart-apply.md.
         */
        post: operations["PipelineService_ApplyPipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PipelineService_ImportPipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * PlanPipeline computes the diff needed to reconcile a pipeline's
         *     currently stored state with the desired config, without applying
         *     anything (read-only, safe to call against a running pipeline). See
         *     docs/design-documents/20260708-live-server-deploy-apply.md.
         */
        post: operations["PipelineService_PlanPipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PipelineService_GetPipeline"];
        put: operations["PipelineService_UpdatePipeline"];
        post?: never;
        delete: operations["PipelineService_DeletePipeline"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/{id}/dead-letter-queue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PipelineService_GetDLQ"];
        put: operations["PipelineService_UpdateDLQ"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/{id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PipelineService_ExportPipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/{id}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PipelineService_StartPipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/pipelines/{id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["PipelineService_StopPipeline"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/plugins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["PluginService_ListPlugins"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ProcessorService_ListProcessors"];
        put?: never;
        post: operations["ProcessorService_CreateProcessor"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processors/plugins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ProcessorService_ListProcessorPlugins"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processors/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ProcessorService_GetProcessor"];
        put: operations["ProcessorService_UpdateProcessor"];
        post?: never;
        delete: operations["ProcessorService_DeleteProcessor"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processors/{id}/inspect-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ProcessorService_InspectProcessorIn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/processors/{id}/inspect-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["ProcessorService_InspectProcessorOut"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ConnectorDestinationState: {
            positions?: {
                [key: string]: string;
            };
        };
        ConnectorServiceUpdateConnectorBody: {
            config?: components["schemas"]["v1ConnectorConfig"];
            plugin?: string;
        };
        ConnectorSourceState: {
            /** Format: byte */
            position?: string;
        };
        PipelineServiceStopPipelineBody: {
            force?: boolean;
        };
        PipelineServiceUpdatePipelineBody: {
            config?: components["schemas"]["v1PipelineConfig"];
        };
        PipelineState: {
            status?: components["schemas"]["v1PipelineStatus"];
            /** @description Error message when pipeline status is STATUS_DEGRADED. */
            error?: string;
        };
        /** @description Deprecated: use config.v1.Validation instead. */
        PluginSpecificationsParameterValidation: {
            type?: components["schemas"]["PluginSpecificationsParameterValidationType"];
            /**
             * @description The value to be compared with the parameter,
             *     or a comma separated list in case of Validation.TYPE_INCLUSION or Validation.TYPE_EXCLUSION.
             */
            value?: string;
        };
        /**
         * @description Deprecated: use config.v1.Validation.Type instead.
         *
         *      - TYPE_REQUIRED: Parameter must be present.
         *      - TYPE_GREATER_THAN: Parameter must be greater than {value}.
         *      - TYPE_LESS_THAN: Parameter must be less than {value}.
         *      - TYPE_INCLUSION: Parameter must be included in the comma separated list {value}.
         *      - TYPE_EXCLUSION: Parameter must not be included in the comma separated list {value}.
         *      - TYPE_REGEX: Parameter must match the regex {value}.
         * @default TYPE_UNSPECIFIED
         * @enum {string}
         */
        PluginSpecificationsParameterValidationType: "TYPE_UNSPECIFIED" | "TYPE_REQUIRED" | "TYPE_GREATER_THAN" | "TYPE_LESS_THAN" | "TYPE_INCLUSION" | "TYPE_EXCLUSION" | "TYPE_REGEX";
        ProcessorParent: {
            type?: components["schemas"]["ProcessorParentType"];
            id?: string;
        };
        /**
         * @description Type shows the processor's parent type.
         *
         *      - TYPE_CONNECTOR: Processor parent is a connector.
         *      - TYPE_PIPELINE: Processor parent is a pipeline.
         * @default TYPE_UNSPECIFIED
         * @enum {string}
         */
        ProcessorParentType: "TYPE_UNSPECIFIED" | "TYPE_CONNECTOR" | "TYPE_PIPELINE";
        ProcessorServiceUpdateProcessorBody: {
            config?: components["schemas"]["v1ProcessorConfig"];
            plugin?: string;
        };
        apiv1Connector: {
            readonly id?: string;
            destinationState?: components["schemas"]["ConnectorDestinationState"];
            sourceState?: components["schemas"]["ConnectorSourceState"];
            config?: components["schemas"]["v1ConnectorConfig"];
            type?: components["schemas"]["v1ConnectorType"];
            plugin?: string;
            pipelineId?: string;
            readonly processorIds?: string[];
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        apiv1Info: {
            version?: string;
            os?: string;
            arch?: string;
        };
        apiv1Processor: {
            readonly id?: string;
            config?: components["schemas"]["v1ProcessorConfig"];
            /**
             * Condition is a goTemplate formatted string, the value provided to the template is a sdk.Record, it should evaluate
             *     to a boolean value, indicating a condition to run the processor for a specific record or not. (template functions
             *     provided by `sprig` are injected)
             */
            condition?: string;
            plugin?: string;
            parent?: components["schemas"]["ProcessorParent"];
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        /** @description Parameter describes a single config parameter. */
        configv1Parameter: {
            /**
             * @description Default is the default value of the parameter. If there is no default
             *     value use an empty string.
             */
            default?: string;
            /** @description Description explains what the parameter does and how to configure it. */
            description?: string;
            type?: components["schemas"]["configv1ParameterType"];
            /** @description Validations are validations to be made on the parameter. */
            validations?: components["schemas"]["configv1Validation"][];
        };
        /**
         * @description Type shows the parameter type.
         *
         *      - TYPE_STRING: Parameter is a string.
         *      - TYPE_INT: Parameter is an integer.
         *      - TYPE_FLOAT: Parameter is a float.
         *      - TYPE_BOOL: Parameter is a boolean.
         *      - TYPE_FILE: Parameter is a file.
         *      - TYPE_DURATION: Parameter is a duration.
         * @default TYPE_UNSPECIFIED
         * @enum {string}
         */
        configv1ParameterType: "TYPE_UNSPECIFIED" | "TYPE_STRING" | "TYPE_INT" | "TYPE_FLOAT" | "TYPE_BOOL" | "TYPE_FILE" | "TYPE_DURATION";
        /** @description Validation to be made on the parameter. */
        configv1Validation: {
            type?: components["schemas"]["configv1ValidationType"];
            /**
             * @description The value to be compared with the parameter,
             *     or a comma separated list in case of Validation.TYPE_INCLUSION or Validation.TYPE_EXCLUSION.
             */
            value?: string;
        };
        /**
         * @description - TYPE_REQUIRED: Parameter must be present.
         *      - TYPE_GREATER_THAN: Parameter must be greater than {value}.
         *      - TYPE_LESS_THAN: Parameter must be less than {value}.
         *      - TYPE_INCLUSION: Parameter must be included in the comma separated list {value}.
         *      - TYPE_EXCLUSION: Parameter must not be included in the comma separated list {value}.
         *      - TYPE_REGEX: Parameter must match the regex {value}.
         * @default TYPE_UNSPECIFIED
         * @enum {string}
         */
        configv1ValidationType: "TYPE_UNSPECIFIED" | "TYPE_REQUIRED" | "TYPE_GREATER_THAN" | "TYPE_LESS_THAN" | "TYPE_INCLUSION" | "TYPE_EXCLUSION" | "TYPE_REGEX";
        googlerpcStatus: {
            /** Format: int32 */
            code?: number;
            message?: string;
            details?: components["schemas"]["protobufAny"][];
        };
        /** @description Change represents the data before and after the operation occurred. */
        opencdcv1Change: {
            before?: components["schemas"]["v1Data"];
            after?: components["schemas"]["v1Data"];
        };
        /**
         * @description Operation defines what triggered the creation of a record.
         *
         *      - OPERATION_CREATE: Records with operation create contain data of a newly created entity.
         *      - OPERATION_UPDATE: Records with operation update contain data of an updated entity.
         *      - OPERATION_DELETE: Records with operation delete contain data of a deleted entity.
         *      - OPERATION_SNAPSHOT: Records with operation snapshot contain data of a previously existing
         *     entity, fetched as part of a snapshot.
         * @default OPERATION_UNSPECIFIED
         * @enum {string}
         */
        opencdcv1Operation: "OPERATION_UNSPECIFIED" | "OPERATION_CREATE" | "OPERATION_UPDATE" | "OPERATION_DELETE" | "OPERATION_SNAPSHOT";
        protobufAny: {
            "@type"?: string;
        } & {
            [key: string]: unknown;
        };
        /**
         * @description `NullValue` is a singleton enumeration to represent the null value for the
         *     `Value` type union.
         *
         *     The JSON representation for `NullValue` is JSON `null`.
         *
         *      - NULL_VALUE: Null value.
         * @default NULL_VALUE
         * @enum {string}
         */
        protobufNullValue: "NULL_VALUE";
        v1ApplyPipelineRequest: {
            config?: components["schemas"]["v1PipelineDocument"];
            /**
             * @description hash must match the hash from a prior PlanPipeline call for this exact
             *     config, or the apply is refused (provisioning.plan_stale).
             */
            hash?: string;
        };
        v1ApplyPipelineResponse: {
            diff?: components["schemas"]["v1Diff"];
        };
        v1ConnectorConfig: {
            name?: string;
            settings?: {
                [key: string]: string;
            };
        };
        /** @description ConnectorPluginSpecifications describes the specifications of a connector plugin. */
        v1ConnectorPluginSpecifications: {
            /** @description Name is the name of the plugin. */
            name?: string;
            /**
             * @description Summary is a brief description of the plugin and what it does,
             *     ideally not longer than one sentence.
             */
            summary?: string;
            /**
             * @description Description is a longer form field, appropriate for README-like
             *     text that the author can provide for documentation about the
             *     usage of the plugin.
             */
            description?: string;
            /**
             * @description Version string. Should follow semantic versioning and use the "v"
             *     prefix (e.g. v1.23.4).
             */
            version?: string;
            /** @description Author declares the entity that created or maintains this plugin. */
            author?: string;
            /**
             * @description A map that describes parameters available for configuring the
             *     destination plugin.
             */
            destinationParams?: {
                [key: string]: components["schemas"]["configv1Parameter"];
            };
            /**
             * @description A map that describes parameters available for configuring the
             *     source plugin.
             */
            sourceParams?: {
                [key: string]: components["schemas"]["configv1Parameter"];
            };
        };
        /**
         * @description Type shows the connector type.
         *
         *      - TYPE_SOURCE: Connector is a source.
         *      - TYPE_DESTINATION: Connector is a destination.
         * @default TYPE_UNSPECIFIED
         * @enum {string}
         */
        v1ConnectorType: "TYPE_UNSPECIFIED" | "TYPE_SOURCE" | "TYPE_DESTINATION";
        v1CreateConnectorRequest: {
            type?: components["schemas"]["v1ConnectorType"];
            /**
             * Used to reference a plugin. Its format is as follows:
             *     [PLUGIN-TYPE:]PLUGIN-NAME[@VERSION]
             *     PLUGIN-TYPE: One of: builtin, standalone or any (default).
             *     PLUGIN-NAME: The name of the plugin as specified in the plugin specifications.
             *     VERSION: The plugin version as specified in the plugin specifications or latest (default).
             *     For more information, see: https://conduit.io/docs/using/connectors/referencing
             */
            plugin?: string;
            /** @description ID of the pipeline to which the connector will get attached. */
            pipelineId?: string;
            config?: components["schemas"]["v1ConnectorConfig"];
        };
        v1CreateConnectorResponse: {
            connector?: components["schemas"]["apiv1Connector"];
        };
        v1CreatePipelineRequest: {
            config?: components["schemas"]["v1PipelineConfig"];
        };
        v1CreatePipelineResponse: {
            pipeline?: components["schemas"]["v1Pipeline"];
        };
        v1CreateProcessorRequest: {
            type?: string;
            parent?: components["schemas"]["ProcessorParent"];
            config?: components["schemas"]["v1ProcessorConfig"];
            condition?: string;
            plugin?: string;
        };
        v1CreateProcessorResponse: {
            processor?: components["schemas"]["apiv1Processor"];
        };
        /**
         * @description Data is used to represent the record key and payload. It can be either raw
         *     data (byte array) or structured data (struct).
         */
        v1Data: {
            /**
             * Format: byte
             * @description Raw data contains unstructured data in form of a byte array.
             */
            rawData?: string;
            /** @description Structured data contains data in form of a struct with fields. */
            structuredData?: Record<string, never>;
        };
        v1DeleteConnectorResponse: Record<string, never>;
        v1DeletePipelineResponse: Record<string, never>;
        v1DeleteProcessorResponse: Record<string, never>;
        /**
         * @description Diff is Plan's result: every change needed to reconcile a pipeline's
         *     currently stored state with a desired PipelineDocument, plus a hash
         *     binding this exact diff — ApplyPipeline refuses to run unless the caller
         *     presents this hash. Mirrors pkg/provisioning.Diff/Change exactly (field
         *     for field) so the API's plan/apply semantics never drift from the CLI
         *     standalone path's.
         */
        v1Diff: {
            pipelineId?: string;
            changes?: components["schemas"]["v1DiffChange"][];
            hash?: string;
        };
        v1DiffChange: {
            /** @description resource is "pipeline", "connector" or "processor". */
            resource?: string;
            id?: string;
            /** @description action is "create", "update" or "delete". */
            action?: string;
            /**
             * @description effect is "in_place" (safe on a running pipeline) or "restart"
             *     (requires stopping it).
             */
            effect?: string;
            configPaths?: string[];
            /**
             * @description code is a stable, dotted identifier for this kind of change, e.g.
             *     "provisioning.connector.update".
             */
            code?: string;
        };
        v1ExportPipelineResponse: {
            pipeline?: components["schemas"]["v1Pipeline"];
        };
        v1GetConnectorResponse: {
            connector?: components["schemas"]["apiv1Connector"];
        };
        v1GetDLQResponse: {
            dlq?: components["schemas"]["v1PipelineDLQ"];
        };
        v1GetInfoResponse: {
            info?: components["schemas"]["apiv1Info"];
        };
        v1GetPipelineResponse: {
            pipeline?: components["schemas"]["v1Pipeline"];
        };
        v1GetProcessorResponse: {
            processor?: components["schemas"]["apiv1Processor"];
        };
        v1ImportPipelineResponse: {
            pipeline?: components["schemas"]["v1Pipeline"];
        };
        v1InspectConnectorResponse: {
            record?: components["schemas"]["v1Record"];
        };
        v1InspectProcessorInResponse: {
            record?: components["schemas"]["v1Record"];
        };
        v1InspectProcessorOutResponse: {
            record?: components["schemas"]["v1Record"];
        };
        v1ListConnectorPluginsResponse: {
            plugins?: components["schemas"]["v1ConnectorPluginSpecifications"][];
        };
        v1ListConnectorsResponse: {
            connectors?: components["schemas"]["apiv1Connector"][];
        };
        v1ListPipelinesResponse: {
            pipelines?: components["schemas"]["v1Pipeline"][];
        };
        v1ListPluginsResponse: {
            plugins?: components["schemas"]["v1PluginSpecifications"][];
        };
        v1ListProcessorPluginsResponse: {
            plugins?: components["schemas"]["v1ProcessorPluginSpecifications"][];
        };
        v1ListProcessorsResponse: {
            processors?: components["schemas"]["apiv1Processor"][];
        };
        v1Pipeline: {
            readonly id?: string;
            state?: components["schemas"]["PipelineState"];
            config?: components["schemas"]["v1PipelineConfig"];
            readonly connectorIds?: string[];
            readonly processorIds?: string[];
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        v1PipelineConfig: {
            name?: string;
            description?: string;
        };
        v1PipelineDLQ: {
            /**
             * plugin is the connector plugin used for storing DLQ records
             *     default = builtin:log, configured to log with level WARN
             */
            plugin?: string;
            /** settings are the plugin settings */
            settings?: {
                [key: string]: string;
            };
            /**
             * window_size defines how many last acks/nacks are monitored in the window
             *     that controls if the pipeline should stop (0 disables the window)
             *     default = 1
             * Format: uint64
             */
            windowSize?: string;
            /**
             * window_nack_threshold defines the number of nacks in the window that are
             *     tolerated. Crossing the threshold stops the pipeline.
             *     default = 0
             * Format: uint64
             */
            windowNackThreshold?: string;
        };
        /**
         * @description PipelineDocument is the whole-pipeline-document shape used by
         *     PlanPipeline/ApplyPipeline: unlike Pipeline.Config (name/description only,
         *     used by the incremental CreatePipeline/UpdatePipeline RPCs), it carries a
         *     pipeline's connectors, processors and DLQ inline — the same shape a
         *     provisioning config file (YAML) parses into
         *     (pkg/provisioning/config.Pipeline) — so a client can Plan/Apply an entire
         *     pipeline definition in one call, the same unit `conduit pipelines deploy|
         *     apply` operates on.
         */
        v1PipelineDocument: {
            id?: string;
            /**
             * @description status is "running" or "stopped"; only meaningful for a not-yet-existing
             *     pipeline (whether ApplyPipeline should start it after creating it).
             */
            status?: string;
            name?: string;
            description?: string;
            connectors?: components["schemas"]["v1PipelineDocumentConnector"][];
            processors?: components["schemas"]["v1PipelineDocumentProcessor"][];
            dlq?: components["schemas"]["v1PipelineDocumentDLQ"];
        };
        v1PipelineDocumentConnector: {
            id?: string;
            /** @description type is "source" or "destination". */
            type?: string;
            plugin?: string;
            name?: string;
            settings?: {
                [key: string]: string;
            };
            processors?: components["schemas"]["v1PipelineDocumentProcessor"][];
        };
        v1PipelineDocumentDLQ: {
            plugin?: string;
            settings?: {
                [key: string]: string;
            };
            /** Format: uint64 */
            windowSize?: string;
            /** Format: uint64 */
            windowNackThreshold?: string;
        };
        v1PipelineDocumentProcessor: {
            id?: string;
            plugin?: string;
            settings?: {
                [key: string]: string;
            };
            /** Format: int32 */
            workers?: number;
            condition?: string;
        };
        /**
         * @description Status describes the pipeline status.
         *
         *      - STATUS_RUNNING: Pipeline is running.
         *      - STATUS_STOPPED: Pipeline gracefully stopped.
         *      - STATUS_DEGRADED: Pipeline stopped with an error (see State.error).
         *      - STATUS_RECOVERING: Pipeline is recovering. This case on of following:
         *     (1) pipeline is being restarted
         *     (2) Conduit is backing off and pipeline will be restarted later
         *     (3) pipeline was restarted, but Conduit is checking if the pipeline is healthy.
         * @default STATUS_UNSPECIFIED
         * @enum {string}
         */
        v1PipelineStatus: "STATUS_UNSPECIFIED" | "STATUS_RUNNING" | "STATUS_STOPPED" | "STATUS_DEGRADED" | "STATUS_RECOVERING";
        v1PlanPipelineRequest: {
            config?: components["schemas"]["v1PipelineDocument"];
        };
        v1PlanPipelineResponse: {
            diff?: components["schemas"]["v1Diff"];
        };
        /** @description Deprecated: use ConnectorPluginSpecifications instead. */
        v1PluginSpecifications: {
            name?: string;
            summary?: string;
            description?: string;
            version?: string;
            author?: string;
            destinationParams?: {
                [key: string]: components["schemas"]["v1PluginSpecificationsParameter"];
            };
            sourceParams?: {
                [key: string]: components["schemas"]["v1PluginSpecificationsParameter"];
            };
        };
        /** @description Deprecated: use config.v1.Parameter instead. */
        v1PluginSpecificationsParameter: {
            description?: string;
            default?: string;
            type?: components["schemas"]["v1PluginSpecificationsParameterType"];
            validations?: components["schemas"]["PluginSpecificationsParameterValidation"][];
        };
        /**
         * @description Deprecated: use config.v1.Parameter.Type instead.
         *
         *      - TYPE_STRING: Parameter is a string.
         *      - TYPE_INT: Parameter is an integer.
         *      - TYPE_FLOAT: Parameter is a float.
         *      - TYPE_BOOL: Parameter is a boolean.
         *      - TYPE_FILE: Parameter is a file.
         *      - TYPE_DURATION: Parameter is a duration.
         * @default TYPE_UNSPECIFIED
         * @enum {string}
         */
        v1PluginSpecificationsParameterType: "TYPE_UNSPECIFIED" | "TYPE_STRING" | "TYPE_INT" | "TYPE_FLOAT" | "TYPE_BOOL" | "TYPE_FILE" | "TYPE_DURATION";
        v1ProcessorConfig: {
            settings?: {
                [key: string]: string;
            };
            /** Format: int32 */
            workers?: number;
        };
        /** @description ProcessorPluginSpecifications describes the specifications of a processor plugin. */
        v1ProcessorPluginSpecifications: {
            /** @description Name is the name of the plugin. */
            name?: string;
            /**
             * @description Summary is a brief description of the plugin and what it does,
             *     ideally not longer than one sentence.
             */
            summary?: string;
            /**
             * @description Description is a longer form field, appropriate for README-like
             *     text that the author can provide for documentation about the
             *     usage of the plugin.
             */
            description?: string;
            /**
             * @description Version string. Should follow semantic versioning and use the "v"
             *     prefix (e.g. v1.23.4).
             */
            version?: string;
            /** @description Author declares the entity that created or maintains this plugin. */
            author?: string;
            /**
             * @description A map that describes parameters available for configuring the
             *     processor plugin.
             */
            parameters?: {
                [key: string]: components["schemas"]["configv1Parameter"];
            };
        };
        /** @description Record contains data about a single change event related to a single entity. */
        v1Record: {
            /**
             * Format: byte
             * @description Position uniquely identifies the record.
             */
            position?: string;
            operation?: components["schemas"]["opencdcv1Operation"];
            /**
             * @description Metadata contains optional information related to the record. Although the
             *     map can contain arbitrary keys, the standard provides a set of standard
             *     metadata fields (see options prefixed with metadata_*).
             */
            metadata?: {
                [key: string]: string;
            };
            key?: components["schemas"]["v1Data"];
            payload?: components["schemas"]["opencdcv1Change"];
        };
        v1StartPipelineResponse: Record<string, never>;
        v1StopPipelineResponse: Record<string, never>;
        v1UpdateConnectorResponse: {
            connector?: components["schemas"]["apiv1Connector"];
        };
        v1UpdateDLQResponse: {
            dlq?: components["schemas"]["v1PipelineDLQ"];
        };
        v1UpdatePipelineResponse: {
            pipeline?: components["schemas"]["v1Pipeline"];
        };
        v1UpdateProcessorResponse: {
            processor?: components["schemas"]["apiv1Processor"];
        };
        v1ValidateConnectorRequest: {
            type?: components["schemas"]["v1ConnectorType"];
            /** @description Plugin name is the name of the builtin plugin (builtin:name), or the absolute path of a standalone plugin. */
            plugin?: string;
            config?: components["schemas"]["v1ConnectorConfig"];
        };
        v1ValidateConnectorResponse: Record<string, never>;
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type SchemaConnectorDestinationState = components['schemas']['ConnectorDestinationState'];
export type SchemaConnectorServiceUpdateConnectorBody = components['schemas']['ConnectorServiceUpdateConnectorBody'];
export type SchemaConnectorSourceState = components['schemas']['ConnectorSourceState'];
export type SchemaPipelineServiceStopPipelineBody = components['schemas']['PipelineServiceStopPipelineBody'];
export type SchemaPipelineServiceUpdatePipelineBody = components['schemas']['PipelineServiceUpdatePipelineBody'];
export type SchemaPipelineState = components['schemas']['PipelineState'];
export type SchemaPluginSpecificationsParameterValidation = components['schemas']['PluginSpecificationsParameterValidation'];
export type SchemaPluginSpecificationsParameterValidationType = components['schemas']['PluginSpecificationsParameterValidationType'];
export type SchemaProcessorParent = components['schemas']['ProcessorParent'];
export type SchemaProcessorParentType = components['schemas']['ProcessorParentType'];
export type SchemaProcessorServiceUpdateProcessorBody = components['schemas']['ProcessorServiceUpdateProcessorBody'];
export type SchemaApiv1Connector = components['schemas']['apiv1Connector'];
export type SchemaApiv1Info = components['schemas']['apiv1Info'];
export type SchemaApiv1Processor = components['schemas']['apiv1Processor'];
export type SchemaConfigv1Parameter = components['schemas']['configv1Parameter'];
export type SchemaConfigv1ParameterType = components['schemas']['configv1ParameterType'];
export type SchemaConfigv1Validation = components['schemas']['configv1Validation'];
export type SchemaConfigv1ValidationType = components['schemas']['configv1ValidationType'];
export type SchemaGooglerpcStatus = components['schemas']['googlerpcStatus'];
export type SchemaOpencdcv1Change = components['schemas']['opencdcv1Change'];
export type SchemaOpencdcv1Operation = components['schemas']['opencdcv1Operation'];
export type SchemaProtobufAny = components['schemas']['protobufAny'];
export type SchemaProtobufNullValue = components['schemas']['protobufNullValue'];
export type SchemaV1ApplyPipelineRequest = components['schemas']['v1ApplyPipelineRequest'];
export type SchemaV1ApplyPipelineResponse = components['schemas']['v1ApplyPipelineResponse'];
export type SchemaV1ConnectorConfig = components['schemas']['v1ConnectorConfig'];
export type SchemaV1ConnectorPluginSpecifications = components['schemas']['v1ConnectorPluginSpecifications'];
export type SchemaV1ConnectorType = components['schemas']['v1ConnectorType'];
export type SchemaV1CreateConnectorRequest = components['schemas']['v1CreateConnectorRequest'];
export type SchemaV1CreateConnectorResponse = components['schemas']['v1CreateConnectorResponse'];
export type SchemaV1CreatePipelineRequest = components['schemas']['v1CreatePipelineRequest'];
export type SchemaV1CreatePipelineResponse = components['schemas']['v1CreatePipelineResponse'];
export type SchemaV1CreateProcessorRequest = components['schemas']['v1CreateProcessorRequest'];
export type SchemaV1CreateProcessorResponse = components['schemas']['v1CreateProcessorResponse'];
export type SchemaV1Data = components['schemas']['v1Data'];
export type SchemaV1DeleteConnectorResponse = components['schemas']['v1DeleteConnectorResponse'];
export type SchemaV1DeletePipelineResponse = components['schemas']['v1DeletePipelineResponse'];
export type SchemaV1DeleteProcessorResponse = components['schemas']['v1DeleteProcessorResponse'];
export type SchemaV1Diff = components['schemas']['v1Diff'];
export type SchemaV1DiffChange = components['schemas']['v1DiffChange'];
export type SchemaV1ExportPipelineResponse = components['schemas']['v1ExportPipelineResponse'];
export type SchemaV1GetConnectorResponse = components['schemas']['v1GetConnectorResponse'];
export type SchemaV1GetDlqResponse = components['schemas']['v1GetDLQResponse'];
export type SchemaV1GetInfoResponse = components['schemas']['v1GetInfoResponse'];
export type SchemaV1GetPipelineResponse = components['schemas']['v1GetPipelineResponse'];
export type SchemaV1GetProcessorResponse = components['schemas']['v1GetProcessorResponse'];
export type SchemaV1ImportPipelineResponse = components['schemas']['v1ImportPipelineResponse'];
export type SchemaV1InspectConnectorResponse = components['schemas']['v1InspectConnectorResponse'];
export type SchemaV1InspectProcessorInResponse = components['schemas']['v1InspectProcessorInResponse'];
export type SchemaV1InspectProcessorOutResponse = components['schemas']['v1InspectProcessorOutResponse'];
export type SchemaV1ListConnectorPluginsResponse = components['schemas']['v1ListConnectorPluginsResponse'];
export type SchemaV1ListConnectorsResponse = components['schemas']['v1ListConnectorsResponse'];
export type SchemaV1ListPipelinesResponse = components['schemas']['v1ListPipelinesResponse'];
export type SchemaV1ListPluginsResponse = components['schemas']['v1ListPluginsResponse'];
export type SchemaV1ListProcessorPluginsResponse = components['schemas']['v1ListProcessorPluginsResponse'];
export type SchemaV1ListProcessorsResponse = components['schemas']['v1ListProcessorsResponse'];
export type SchemaV1Pipeline = components['schemas']['v1Pipeline'];
export type SchemaV1PipelineConfig = components['schemas']['v1PipelineConfig'];
export type SchemaV1PipelineDlq = components['schemas']['v1PipelineDLQ'];
export type SchemaV1PipelineDocument = components['schemas']['v1PipelineDocument'];
export type SchemaV1PipelineDocumentConnector = components['schemas']['v1PipelineDocumentConnector'];
export type SchemaV1PipelineDocumentDlq = components['schemas']['v1PipelineDocumentDLQ'];
export type SchemaV1PipelineDocumentProcessor = components['schemas']['v1PipelineDocumentProcessor'];
export type SchemaV1PipelineStatus = components['schemas']['v1PipelineStatus'];
export type SchemaV1PlanPipelineRequest = components['schemas']['v1PlanPipelineRequest'];
export type SchemaV1PlanPipelineResponse = components['schemas']['v1PlanPipelineResponse'];
export type SchemaV1PluginSpecifications = components['schemas']['v1PluginSpecifications'];
export type SchemaV1PluginSpecificationsParameter = components['schemas']['v1PluginSpecificationsParameter'];
export type SchemaV1PluginSpecificationsParameterType = components['schemas']['v1PluginSpecificationsParameterType'];
export type SchemaV1ProcessorConfig = components['schemas']['v1ProcessorConfig'];
export type SchemaV1ProcessorPluginSpecifications = components['schemas']['v1ProcessorPluginSpecifications'];
export type SchemaV1Record = components['schemas']['v1Record'];
export type SchemaV1StartPipelineResponse = components['schemas']['v1StartPipelineResponse'];
export type SchemaV1StopPipelineResponse = components['schemas']['v1StopPipelineResponse'];
export type SchemaV1UpdateConnectorResponse = components['schemas']['v1UpdateConnectorResponse'];
export type SchemaV1UpdateDlqResponse = components['schemas']['v1UpdateDLQResponse'];
export type SchemaV1UpdatePipelineResponse = components['schemas']['v1UpdatePipelineResponse'];
export type SchemaV1UpdateProcessorResponse = components['schemas']['v1UpdateProcessorResponse'];
export type SchemaV1ValidateConnectorRequest = components['schemas']['v1ValidateConnectorRequest'];
export type SchemaV1ValidateConnectorResponse = components['schemas']['v1ValidateConnectorResponse'];
export type $defs = Record<string, never>;
export interface operations {
    InformationService_GetInfo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Info"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_ListConnectors: {
        parameters: {
            query?: {
                pipelineId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Connector"][];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_CreateConnector: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1CreateConnectorRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Connector"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_ListConnectorPlugins: {
        parameters: {
            query?: {
                /** @description Regex to filter plugins by name. */
                name?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1ConnectorPluginSpecifications"][];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_ValidateConnector: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1ValidateConnectorRequest"];
            };
        };
        responses: {
            /** @description A successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1ValidateConnectorResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_GetConnector: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Connector"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_UpdateConnector: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConnectorServiceUpdateConnectorBody"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Connector"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_DeleteConnector: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1DeleteConnectorResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ConnectorService_InspectConnector: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description (streaming responses) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        result?: components["schemas"]["v1Record"];
                    };
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_ListPipelines: {
        parameters: {
            query?: {
                /** @description Regex to filter pipelines by name. */
                name?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Pipeline"][];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_CreatePipeline: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1CreatePipelineRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Pipeline"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_ApplyPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1ApplyPipelineRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Diff"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_ImportPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1Pipeline"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Pipeline"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_PlanPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1PlanPipelineRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Diff"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_GetPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Pipeline"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_UpdatePipeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PipelineServiceUpdatePipelineBody"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Pipeline"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_DeletePipeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1DeletePipelineResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_GetDLQ: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1PipelineDLQ"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_UpdateDLQ: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1PipelineDLQ"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1PipelineDLQ"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_ExportPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1Pipeline"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_StartPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1StartPipelineResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PipelineService_StopPipeline: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PipelineServiceStopPipelineBody"];
            };
        };
        responses: {
            /** @description A successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1StopPipelineResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    PluginService_ListPlugins: {
        parameters: {
            query?: {
                /** @description Regex to filter plugins by name. */
                name?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1PluginSpecifications"][];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_ListProcessors: {
        parameters: {
            query?: {
                parentIds?: string[];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Processor"][];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_CreateProcessor: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["v1CreateProcessorRequest"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Processor"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_ListProcessorPlugins: {
        parameters: {
            query?: {
                /** @description Regex to filter plugins by name. */
                name?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1ProcessorPluginSpecifications"][];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_GetProcessor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Processor"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_UpdateProcessor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProcessorServiceUpdateProcessorBody"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["apiv1Processor"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_DeleteProcessor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A successful response. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["v1DeleteProcessorResponse"];
                };
            };
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_InspectProcessorIn: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description (streaming responses) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        result?: components["schemas"]["v1Record"];
                    };
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
    ProcessorService_InspectProcessorOut: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description (streaming responses) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        result?: components["schemas"]["v1Record"];
                    };
                };
            };
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["googlerpcStatus"];
                };
            };
        };
    };
}
