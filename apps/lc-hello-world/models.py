from pydantic import BaseModel, Field
from typing import List

class Source(BaseModel):
  """Schema for source used by agent"""

  url:str = Field(description="URL of the source")


class AgentResponse(BaseModel):
  """ Agent response given by LLM """

  answer:str = Field("Answer by the LLM or AI model")
  sources: List[Source] = Field(default_factory=list, description="List of sources provided by LLM / AI model to support its response")




