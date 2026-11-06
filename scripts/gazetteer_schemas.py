"""Executable schemas for the present candidate format (Pydantic 2)."""
from typing import Any,Literal,Annotated
from pydantic import model_validator
from pydantic import BaseModel,ConfigDict,Field
class Strict(BaseModel):model_config=ConfigDict(extra='forbid',strict=True)
class City(Strict):
 id:str;geonames_id:str;modern_local:str;modern_zh:str;country:str;admin1:str
class Record(Strict):id:str;source_row:int
class Name(Strict):
 id:str;city_id:str|None;text:str;script:str;language:str|None;type:Literal['catalogue_candidate'];status:Literal['unverified','verified','disputed'];start_year:int|None;end_year:int|None
class Evidence(Strict):
 id:str;name_id:str;record_id:str;archive_number:str;source_row:int;date_raw:str;context:str;place_raw:str;basis:str;source_status:str;historical_assessment:str;disagreement:str;status:Literal['catalogue_only','uncertain','disputed']
class Data(Strict):
 schema_version:Literal['1.0.0'];source:str;cities:list[City];records:list[Record];names:list[Name];evidence:list[Evidence]

class Cell(Strict):column:int;cell_type:str;value:Any;source_text:str;display_text:str
class SourceFields(Strict):archive_number:Cell;date:Cell;place:Cell
class SourceRecord(Strict):row:int;fields:SourceFields
class Contract(Strict):
 contract_version:Literal['1.0.0'];workbook_sha256:str;reader:str;sheet:Literal['Sheet1'];records:dict[str,SourceRecord];errors:list[Any]
class SourceRef(Strict):workbook_sha256:str;sheet:str;row:int;column:int
class EventBase(Strict):
 id:str;reason:str=Field(min_length=1);evidence_note:str|None=None;review:str|None=None
class AddEvent(EventBase):
 op:Literal['add'];kind:Literal['name','evidence'];data:Name|Evidence
class RevisionEvent(EventBase):
 op:Literal['revise'];expected_status:Literal['active'];expected:Name|Evidence;data:Name|Evidence;source:SourceRef|None=None
class DeleteEvent(EventBase):
 op:Literal['delete'];expected_status:Literal['active'];expected:Name|Evidence
class RestoreEvent(EventBase):
 op:Literal['restore'];expected_status:Literal['deleted'];expected:Name|Evidence
class SplitEvent(EventBase):
 op:Literal['split'];kind:Literal['name','evidence'];sources:list[str];targets:list[str];target_data:dict[str,Name|Evidence];evidence_assignments:dict[str,str]|None=None
class MergeEvent(EventBase):
 op:Literal['merge'];kind:Literal['name','evidence'];sources:list[str];targets:list[str];target_data:dict[str,Name|Evidence];evidence_assignments:dict[str,str]|None=None
Event=Annotated[AddEvent|RevisionEvent|DeleteEvent|RestoreEvent|SplitEvent|MergeEvent,Field(discriminator='op')]
class EventBatch(Strict):batch_id:str;unresolved:list[Any];events:list[Event]
class RegObject(Strict):
 kind:Literal['name','evidence'];status:Literal['active','deleted','superseded'];data:Name|Evidence;predecessors:list[str];successors:list[str]
 @model_validator(mode='after')
 def check_kind(self):
  if (self.kind=='name') != isinstance(self.data,Name):raise ValueError('kind/data mismatch')
  return self
class Registry(Strict):
 version:Literal['1.0.0'];objects:dict[str,RegObject];batches:dict[str,str];history:list[Event]
class Manifest(Strict):
 format_version:Literal['1.0.0'];source_sha256:str;contract_version:str;schema_version:str;parent:str;batch_id:str;batch_sha256:str;files:dict[str,str];release_id:str
